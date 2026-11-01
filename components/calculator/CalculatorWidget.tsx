'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Calculator as CalculatorIcon,
  X,
  History,
  ArrowLeft,
  Trash2,
  Mic,
  Square,
  MoveDiagonal2,
  Minus,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { CalculatorConverter } from '@/components/calculator/CalculatorConverter';
import { evaluateMathExpression } from '@/utils/mathExpression';
import { authFetch } from '@/lib/authFetch';

type Operator = '+' | '-' | '×' | '÷' | '^' | 'yroot' | null;
type CalcMode = 'basic' | 'scientific' | 'converter';
type AngleMode = 'deg' | 'rad';

interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
}

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 460;
const MIN_WIDTH = 260;
const MIN_HEIGHT = 380;
const EDGE_MARGIN = 8;
const MINI_SIZE = 56;
// Below this width the calculator shows the basic pad only; at or above it,
// scientific mode's extra column fits comfortably — matches macOS Calculator
// revealing scientific functions when you widen the window.
const SCI_WIDTH = 520;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function formatResult(num: number): string {
  if (!isFinite(num)) return 'Error';
  if (Number.isInteger(num)) return String(num);
  const rounded = parseFloat(num.toPrecision(10));
  return String(rounded);
}

function formatDisplay(raw: string): string {
  if (raw === 'Error' || raw.includes('e')) return raw;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = unsigned.split('.');
  const formattedInt = new Intl.NumberFormat('en-US').format(Number(intPart || '0'));
  return (negative ? '-' : '') + formattedInt + (decPart !== undefined ? '.' + decPart : '');
}

/**
 * A pasted number in any usual format: "1500000", "1.500.000" (Chile),
 * "1,500,000.75" (this display), "1.500.000,75", "$ 1.500.000", or a plain
 * expression like "1500 + 300 * 2". null if it isn't one.
 */
export function parsePastedNumber(text: string): number | null {
  const t = text.replace(/[\s\u00a0]|US\$|\$|CLP|USD/gi, '').replace(/[−–]/g, '-');
  if (!t) return null;
  if (/^-?[\d.,]+$/.test(t) && /\d/.test(t)) {
    const lastDot = t.lastIndexOf('.');
    const lastComma = t.lastIndexOf(',');
    let n: string;
    if (lastDot >= 0 && lastComma >= 0) {
      // Both: the last one is the decimal separator.
      n = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if (lastComma >= 0) {
      n = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    } else if (lastDot >= 0) {
      n = /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
    } else n = t;
    const v = Number(n);
    return Number.isFinite(v) ? v : null;
  }
  try {
    const v = evaluateMathExpression(text.replace(/×/g, '*').replace(/÷/g, '/'));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function calculate(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
    case '^':
      return Math.pow(a, b);
    case 'yroot':
      return Math.pow(a, 1 / b);
    default:
      return b;
  }
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// Normalizes a Spanish voice transcript by mapping spoken operator words to
// symbols and small spoken numbers to digits. Chrome's es-CL recognition
// usually already numeralizes digits on its own; this is a best-effort
// fallback plus the operator-word mapping every phrase needs regardless.
const NUMBER_WORDS: Record<string, string> = {
  cero: '0', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5',
  seis: '6', siete: '7', ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12',
  trece: '13', catorce: '14', quince: '15', veinte: '20', treinta: '30',
  cuarenta: '40', cincuenta: '50', sesenta: '60', setenta: '70', ochenta: '80', noventa: '90',
  cien: '100', cientos: '100',
};

function normalizeVoiceText(transcript: string): string {
  let text = ` ${transcript.toLowerCase().trim()} `;
  text = text
    .replace(/\bpor ciento\b/g, ' % ')
    .replace(/\bmás\b|\bmas\b|\bsumar\b/g, ' + ')
    .replace(/\bmenos\b|\brestar\b/g, ' - ')
    .replace(/\bmultiplicado por\b|\bpor\b|\bveces\b/g, ' * ')
    .replace(/\bdividido por\b|\bdividido entre\b|\bdividido\b|\bentre\b/g, ' / ')
    .replace(/\bigual a\b|\bigual\b|\bresultado\b/g, ' = ')
    .replace(/\bcoma\b|\bpunto\b/g, '.');

  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    text = text.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
  }
  return text;
}

function tokenizeVoiceTranscript(transcript: string): string[] {
  return normalizeVoiceText(transcript).match(/(\d+\.?\d*|\.\d+|[+\-*/=%])/g) ?? [];
}

// True when the dictated phrase is nothing but numbers/operators once
// normalized — the fast, free, local path. Anything with leftover words
// (a worded problem, unfamiliar vocabulary) falls back to the AI solver.
function isPureArithmetic(transcript: string): boolean {
  const stripped = normalizeVoiceText(transcript).replace(/[\d.\s+\-*/=%]/g, '');
  return stripped.length === 0;
}

interface EvalResult {
  display: string;
  previousValue: number | null;
  operator: Operator;
  newHistoryEntries: HistoryEntry[];
}

// Applies a full token sequence to a *local* running state (no React state
// reads at all) and returns the end result in one shot. Dictation hands us
// the whole transcript at once, as a batch of tokens that must be applied in
// order — running each token through the button-driven handlers instead
// (which read current display/operator/etc from component state) would read
// the same stale snapshot for every token in the batch, since no re-render
// happens between them. Keeping this pure sidesteps that entirely.
function evaluateTokens(tokens: string[], startDisplay: string): EvalResult {
  let display = startDisplay;
  let previousValue: number | null = null;
  let operator: Operator = null;
  const newHistoryEntries: HistoryEntry[] = [];

  tokens.forEach((rawToken, idx) => {
    if (rawToken === '=') {
      if (operator && previousValue !== null) {
        const inputValue = parseFloat(display);
        const result = calculate(previousValue, inputValue, operator);
        const expression = `${formatDisplay(formatResult(previousValue))} ${operator} ${formatDisplay(String(inputValue))}`;
        const resultStr = formatResult(result);
        newHistoryEntries.push({ id: `h-${Date.now()}-${idx}`, expression, result: resultStr });
        display = resultStr;
        previousValue = null;
        operator = null;
      }
    } else if (rawToken === '%') {
      const value = parseFloat(display);
      if (!isNaN(value)) display = formatResult(value / 100);
    } else if (['+', '-', '×', '*', '÷', '/'].includes(rawToken)) {
      const opMap: Record<string, Operator> = { '+': '+', '-': '-', '*': '×', '×': '×', '/': '÷', '÷': '÷' };
      const nextOperator = opMap[rawToken];
      const inputValue = parseFloat(display);
      if (previousValue === null || !operator) {
        previousValue = inputValue;
      } else {
        previousValue = calculate(previousValue, inputValue, operator);
        display = formatResult(previousValue);
      }
      operator = nextOperator;
    } else {
      display = rawToken;
    }
  });

  return { display, previousValue, operator, newHistoryEntries };
}

export interface CalculatorWidgetHandle {
  open: () => void;
}

export const CalculatorWidget = forwardRef<CalculatorWidgetHandle>((_props, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasPositioned, setHasPositioned] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [mode, setMode] = useState<CalcMode>('basic');
  const [angleMode, setAngleMode] = useState<AngleMode>('deg');

  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [pendingExpression, setPendingExpression] = useState('');

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [voiceSupported, setVoiceSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');

  const widgetRef = useRef<HTMLDivElement>(null);

  const applyEvalResult = (evalResult: EvalResult) => {
    setDisplay(evalResult.display);
    setPreviousValue(evalResult.previousValue);
    setOperator(evalResult.operator);
    setWaitingForOperand(evalResult.operator !== null);
    setPendingExpression(
      evalResult.operator ? `${formatDisplay(formatResult(evalResult.previousValue ?? 0))} ${evalResult.operator}` : ''
    );
    if (evalResult.newHistoryEntries.length > 0) {
      setHistory((prev) => [...evalResult.newHistoryEntries.slice().reverse(), ...prev].slice(0, 50));
    }
  };

  // Runs the whole dictated phrase as one complete calculation. Plain
  // arithmetic ("doce más ocho") is evaluated instantly and locally, for
  // free. Anything else — worded problems ("el iva del 19% de 850 mil",
  // "raíz cuadrada de 144") — goes to the AI solver endpoint, which turns it
  // into a formula that gets evaluated exactly (see /api/calculator-solve).
  const processDictation = async (transcript: string) => {
    if (isPureArithmetic(transcript)) {
      let tokens = tokenizeVoiceTranscript(transcript);
      if (tokens.length === 0) return;
      if (tokens[tokens.length - 1] !== '=') tokens = [...tokens, '='];
      applyEvalResult(evaluateTokens(tokens, '0'));
      return;
    }

    setIsSolving(true);
    setVoiceError('');
    try {
      const res = await authFetch('/api/calculator-solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setVoiceError(data.error || 'No se pudo resolver el problema.');
        return;
      }
      if (!data.understood) {
        setVoiceError('No entendí el problema. Intenta de nuevo.');
        return;
      }
      const resultStr = formatResult(data.result);
      setDisplay(resultStr);
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(true);
      setPendingExpression('');
      setHistory((prev) =>
        [{ id: `h-${Date.now()}`, expression: data.label || data.expression, result: resultStr }, ...prev].slice(0, 50)
      );
    } catch {
      setVoiceError('Error de conexión al resolver el problema.');
    } finally {
      setIsSolving(false);
    }
  };

  useEffect(() => {
    if (!voiceError) return;
    const t = setTimeout(() => setVoiceError(''), 6000);
    return () => clearTimeout(t);
  }, [voiceError]);

  // --- Voice dictation setup ---
  // Continuous + interim results so the transcript keeps growing (and is
  // shown live) across natural pauses instead of cutting off after the
  // first phrase; the full transcript is only evaluated once, when the
  // user stops listening (see onend below), rather than token-by-token as
  // partial results stream in.
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-CL';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      transcriptRef.current = text;
      setVoiceTranscript(text);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => {
      setIsListening(false);
      const finalText = transcriptRef.current.trim();
      transcriptRef.current = '';
      setVoiceTranscript('');
      if (finalText) processDictation(finalText);
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return; // onend flips isListening off and runs the calculation
    }
    transcriptRef.current = '';
    setVoiceTranscript('');
    setVoiceError('');
    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch {
      // recognition already running — ignore
    }
  };

  // --- Keep the window (or the minimized pill) on-screen when the browser resizes ---
  useEffect(() => {
    const handleWindowResize = () => {
      if (isMinimized) {
        setPosition((pos) => ({
          x: clamp(pos.x, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerWidth - MINI_SIZE - EDGE_MARGIN)),
          y: clamp(pos.y, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerHeight - MINI_SIZE - EDGE_MARGIN)),
        }));
        return;
      }
      setSize((sz) => {
        const newSize = {
          width: clamp(sz.width, MIN_WIDTH, window.innerWidth - EDGE_MARGIN * 2),
          height: clamp(sz.height, MIN_HEIGHT, window.innerHeight - EDGE_MARGIN * 2),
        };
        setPosition((pos) => ({
          x: clamp(pos.x, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerWidth - newSize.width - EDGE_MARGIN)),
          y: clamp(pos.y, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerHeight - newSize.height - EDGE_MARGIN)),
        }));
        return newSize;
      });
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [isMinimized]);

  const openCalculator = () => {
    if (!hasPositioned) {
      const width = DEFAULT_WIDTH;
      const height = DEFAULT_HEIGHT;
      setSize({ width, height });
      setPosition({
        x: clamp(window.innerWidth - width - 24, EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN),
        y: clamp(window.innerHeight - height - 100, EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN),
      });
      setHasPositioned(true);
    }
    setIsMinimized(false);
    setIsOpen(true);
  };

  const closeCalculator = () => {
    setIsOpen(false);
    setIsMinimized(false);
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
  };

  const restoreFromMinimized = () => {
    setPosition((pos) => ({
      x: clamp(pos.x, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerWidth - size.width - EDGE_MARGIN)),
      y: clamp(pos.y, EDGE_MARGIN, Math.max(EDGE_MARGIN, window.innerHeight - size.height - EDGE_MARGIN)),
    }));
    setIsMinimized(false);
  };

  // Opened externally via QuickActionsDial — this widget no longer renders
  // its own floating trigger button (see the `if (!isOpen)` branch below).
  useImperativeHandle(ref, () => ({ open: openCalculator }));

  // --- Drag (shared by the full header and the minimized pill, each passing their own footprint) ---
  const startDrag = (e: React.MouseEvent, dims: { width: number; height: number }) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...position };

    const onMove = (ev: MouseEvent) => {
      setPosition({
        x: clamp(startPos.x + (ev.clientX - startX), EDGE_MARGIN, window.innerWidth - dims.width - EDGE_MARGIN),
        y: clamp(startPos.y + (ev.clientY - startY), EDGE_MARGIN, window.innerHeight - dims.height - EDGE_MARGIN),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // --- Resize (corner handle) ---
  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const onMove = (ev: MouseEvent) => {
      const newWidth = clamp(startWidth + (ev.clientX - startX), MIN_WIDTH, window.innerWidth - position.x - EDGE_MARGIN);
      const newHeight = clamp(startHeight + (ev.clientY - startY), MIN_HEIGHT, window.innerHeight - position.y - EDGE_MARGIN);
      setSize({ width: newWidth, height: newHeight });
      // Widening past the threshold reveals scientific mode, like macOS Calculator; narrowing back below it returns to basic.
      setMode((m) => {
        if (m === 'converter') return m;
        if (newWidth >= SCI_WIDTH && m === 'basic') return 'scientific';
        if (newWidth < SCI_WIDTH && m === 'scientific') return 'basic';
        return m;
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleModeChange = (next: CalcMode) => {
    if (next === 'scientific' && size.width < SCI_WIDTH) {
      // Widen to fit the scientific pad — shifting the window left first if
      // it's anchored near the right edge and can't grow rightward alone.
      const targetWidth = clamp(SCI_WIDTH, MIN_WIDTH, window.innerWidth - EDGE_MARGIN * 2);
      setPosition((pos) => ({ ...pos, x: clamp(pos.x, EDGE_MARGIN, window.innerWidth - targetWidth - EDGE_MARGIN) }));
      setSize((sz) => ({ ...sz, width: targetWidth }));
    }
    setMode(next);
  };

  // --- Calculator engine ---
  const inputDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay((prev) => (prev === '0' ? digit : prev + digit));
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    setDisplay((prev) => (prev.includes('.') ? prev : prev + '.'));
  };

  const clearAll = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(false);
    setPendingExpression('');
  };

  const backspace = () => {
    setDisplay((prev) => {
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) return '0';
      return prev.slice(0, -1);
    });
  };

  const toggleSign = () => {
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : '-' + prev));
  };

  const inputPercent = () => {
    const value = parseFloat(display);
    if (isNaN(value)) return;
    setDisplay(formatResult(value / 100));
  };

  const performOperation = (nextOperator: Operator) => {
    const inputValue = parseFloat(display);
    let newPrevious: number;
    if (previousValue === null || !operator) {
      newPrevious = inputValue;
    } else {
      newPrevious = calculate(previousValue, inputValue, operator);
      setDisplay(formatResult(newPrevious));
    }
    setPreviousValue(newPrevious);
    setPendingExpression(`${formatDisplay(formatResult(newPrevious))} ${nextOperator}`);
    setWaitingForOperand(true);
    setOperator(nextOperator);
  };

  const handleEquals = () => {
    const inputValue = parseFloat(display);
    if (operator && previousValue !== null) {
      const result = calculate(previousValue, inputValue, operator);
      const expression = `${formatDisplay(formatResult(previousValue))} ${operator} ${formatDisplay(String(inputValue))}`;
      const resultStr = formatResult(result);
      setHistory((prev) => [{ id: `h-${Date.now()}`, expression, result: resultStr }, ...prev].slice(0, 50));
      setDisplay(resultStr);
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(true);
      setPendingExpression('');
    }
  };

  // Scientific unary functions (x², √x, sin, etc.) apply immediately to
  // whatever's on screen — same one-shot pattern as inputPercent/toggleSign
  // — and log to history since each is itself a small calculation.
  const applyUnary = (label: (v: string) => string, fn: (n: number) => number) => {
    const value = parseFloat(display);
    if (isNaN(value)) return;
    const result = fn(value);
    const resultStr = formatResult(result);
    setHistory((prev) => [{ id: `h-${Date.now()}`, expression: label(formatDisplay(display)), result: resultStr }, ...prev].slice(0, 50));
    setDisplay(resultStr);
    setWaitingForOperand(true);
    setPendingExpression('');
  };

  const toRadians = (deg: number) => (angleMode === 'deg' ? (deg * Math.PI) / 180 : deg);

  const insertConstant = (value: number) => {
    setDisplay(formatResult(value));
    setWaitingForOperand(false);
    setPendingExpression('');
  };

  const useHistoryEntry = (entry: HistoryEntry) => {
    setDisplay(entry.result);
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(true);
    setShowHistory(false);
  };

  // --- Physical keyboard input (only while the full window is open, no other field is focused, and we're not in the converter) ---
  useEffect(() => {
    if (!isOpen || isMinimized || mode === 'converter') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const isEditableFocused =
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);
      if (isEditableFocused) return;

      if (e.key >= '0' && e.key <= '9') {
        inputDigit(e.key);
      } else if (e.key === '.') {
        inputDecimal();
      } else if (e.key === '+') {
        performOperation('+');
      } else if (e.key === '-') {
        performOperation('-');
      } else if (e.key === '*') {
        performOperation('×');
      } else if (e.key === '/') {
        e.preventDefault();
        performOperation('÷');
      } else if (e.key === '^') {
        performOperation('^');
      } else if (e.key === '%') {
        inputPercent();
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        backspace();
      } else if (e.key === 'Escape') {
        clearAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isMinimized, mode, display, previousValue, operator, waitingForOperand]);

  // --- Copy / paste numbers (⌘C / ⌘V, Ctrl+C / Ctrl+V) — same guards as the keyboard ---
  const [copied, setCopied] = useState(false);
  const [pasteError, setPasteError] = useState(false);
  const copyDisplay = () => {
    if (display === 'Error') return;
    navigator.clipboard?.writeText(display).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  useEffect(() => {
    if (!isOpen || isMinimized || mode === 'converter') return;
    const editableFocused = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (editableFocused()) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const v = parsePastedNumber(text);
      e.preventDefault();
      if (v === null) {
        setPasteError(true);
        setTimeout(() => setPasteError(false), 1800);
        return;
      }
      // Like typing it: replaces the number being entered, keeps a pending operation.
      setDisplay(formatResult(v));
      setWaitingForOperand(false);
    };
    const onCopy = (e: ClipboardEvent) => {
      if (editableFocused() || (window.getSelection()?.toString() ?? '') !== '' || display === 'Error') return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('copy', onCopy);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('copy', onCopy);
    };
  }, [isOpen, isMinimized, mode, display]);

  const funcBtn = 'bg-zinc-700 hover:bg-zinc-600 text-white';
  const opBtn = (active: boolean) => `bg-sky-600 hover:bg-sky-500 text-white ${active ? 'ring-2 ring-white/60' : ''}`;
  const digitBtn = 'bg-zinc-800 hover:bg-zinc-700 text-white';
  const sciBtn = 'bg-zinc-800/70 hover:bg-zinc-700 text-zinc-100 text-[13px]';
  const btnBase =
    'aspect-square w-full rounded-full text-base font-medium transition-colors active:scale-95 flex items-center justify-center';

  // No own floating trigger — opened via QuickActionsDial instead.
  if (!isOpen) {
    return null;
  }

  if (isMinimized) {
    return createPortal(
      <button
        onMouseDown={(e) => startDrag(e, { width: MINI_SIZE, height: MINI_SIZE })}
        onClick={restoreFromMinimized}
        title="Restaurar calculadora"
        style={{ left: position.x, top: position.y }}
        className="fixed z-[95] flex h-14 w-14 cursor-grab select-none items-center justify-center rounded-full border border-zinc-700 bg-[#18181b] text-sky-400 shadow-2xl transition-transform hover:text-sky-300 active:scale-95 active:cursor-grabbing"
      >
        <CalculatorIcon className="h-6 w-6" />
      </button>,
      document.body,
    );
  }

  // Portal + z-[95]: above Empresa windows (75), notes (85) and full-screen views.
  return createPortal(
    <div
      ref={widgetRef}
      style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
      className="fixed z-[95] flex flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-[#18181b] shadow-2xl select-none"
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={(e) => startDrag(e, size)}
        className="flex cursor-grab items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-3 py-2 active:cursor-grabbing"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <CalculatorIcon className="h-3.5 w-3.5 text-sky-400" />
          Calculadora
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory((v) => !v)}
            title="Historial"
            className={`rounded-lg p-1.5 transition-colors ${showHistory ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            title="Minimizar"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={closeCalculator}
            title="Cerrar"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-400"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
            <button
              onClick={() => setShowHistory(false)}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </button>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" /> Borrar historial
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
            {history.length === 0 ? (
              <p className="mt-6 text-center text-xs text-zinc-500">Aún no hay cálculos.</p>
            ) : (
              history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => useHistoryEntry(h)}
                  className="block w-full rounded-lg bg-zinc-900 px-3 py-2 text-right hover:bg-zinc-800"
                >
                  <div className="text-[10px] text-zinc-500 font-mono truncate">{h.expression} =</div>
                  <div className="text-sm font-mono font-semibold text-white">{formatDisplay(h.result)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          {/* Mode tabs: Básica / Científica / Conversor */}
          <div className="flex gap-1 rounded-xl bg-zinc-900 p-1 shrink-0">
            {(['basic', 'scientific', 'converter'] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
                  mode === m ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {m === 'basic' ? 'Básica' : m === 'scientific' ? 'Científica' : 'Conversor'}
              </button>
            ))}
          </div>

          {mode === 'converter' ? (
            <CalculatorConverter />
          ) : (
            <>
              {/* Display */}
              <div className="group/display relative flex min-h-[64px] flex-col justify-end overflow-x-auto rounded-xl bg-zinc-950/60 px-3 py-2 text-right shrink-0" title="⌘V / Ctrl+V pega un número · ⌘C / Ctrl+C copia el resultado">
                {pasteError ? (
                  <div className="text-[11px] text-rose-300">Eso no es un número que pueda pegar</div>
                ) : (
                  pendingExpression && <div className="text-[11px] text-zinc-500 font-mono truncate">{pendingExpression}</div>
                )}
                <div className="whitespace-nowrap font-mono text-3xl font-semibold text-white">{formatDisplay(display)}</div>
                <button
                  type="button"
                  onClick={copyDisplay}
                  aria-label="Copiar resultado"
                  title="Copiar resultado"
                  className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition ${copied ? 'text-emerald-300' : 'text-zinc-500 opacity-0 hover:bg-white/10 hover:text-white group-hover/display:opacity-100 focus:opacity-100'}`}
                >
                  {copied ? <><Check className="h-3.5 w-3.5" /> Copiado</> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              {/* Voice dictation */}
              {voiceSupported && (
                <div className="space-y-1 shrink-0">
                  <button
                    onClick={toggleListening}
                    disabled={isSolving}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                      isListening ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {isSolving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : isListening ? (
                      <Square className="h-3 w-3" />
                    ) : (
                      <Mic className="h-3 w-3" />
                    )}
                    {isSolving ? 'Resolviendo…' : isListening ? 'Escuchando… toca para calcular' : 'Dictar por voz'}
                  </button>
                  {isListening && (
                    <div className="min-h-[26px] truncate rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-[11px] italic text-zinc-300">
                      {voiceTranscript || 'Habla ahora… puedes pedirle que resuelva un problema'}
                    </div>
                  )}
                  {voiceError && <p className="px-0.5 text-[11px] text-rose-400">{voiceError}</p>}
                </div>
              )}

              {/* Keypad(s) */}
              <div className="flex min-h-0 flex-1 gap-2">
                {mode === 'scientific' && (
                  <div className="grid flex-1 grid-cols-4 gap-2">
                    <button onClick={() => applyUnary((v) => `(${v})²`, (n) => n * n)} className={`${btnBase} ${sciBtn}`}>x²</button>
                    <button onClick={() => applyUnary((v) => `(${v})³`, (n) => Math.pow(n, 3))} className={`${btnBase} ${sciBtn}`}>x³</button>
                    <button onClick={() => performOperation('^')} className={`${btnBase} ${opBtn(operator === '^')}`}>xʸ</button>
                    <button onClick={() => applyUnary((v) => `1/(${v})`, (n) => (n === 0 ? NaN : 1 / n))} className={`${btnBase} ${sciBtn}`}>1/x</button>

                    <button onClick={() => applyUnary((v) => `√(${v})`, (n) => (n < 0 ? NaN : Math.sqrt(n)))} className={`${btnBase} ${sciBtn}`}>√x</button>
                    <button onClick={() => applyUnary((v) => `³√(${v})`, (n) => Math.cbrt(n))} className={`${btnBase} ${sciBtn}`}>³√x</button>
                    <button onClick={() => performOperation('yroot')} className={`${btnBase} ${opBtn(operator === 'yroot')}`}>ʸ√x</button>
                    <button onClick={() => applyUnary((v) => `(${v})!`, factorial)} className={`${btnBase} ${sciBtn}`}>x!</button>

                    <button onClick={() => applyUnary((v) => `ln(${v})`, (n) => (n <= 0 ? NaN : Math.log(n)))} className={`${btnBase} ${sciBtn}`}>ln</button>
                    <button onClick={() => applyUnary((v) => `log(${v})`, (n) => (n <= 0 ? NaN : Math.log10(n)))} className={`${btnBase} ${sciBtn}`}>log</button>
                    <button onClick={() => applyUnary((v) => `e^(${v})`, (n) => Math.exp(n))} className={`${btnBase} ${sciBtn}`}>eˣ</button>
                    <button onClick={() => applyUnary((v) => `10^(${v})`, (n) => Math.pow(10, n))} className={`${btnBase} ${sciBtn}`}>10ˣ</button>

                    <button onClick={() => applyUnary((v) => `sin(${v})`, (n) => Math.sin(toRadians(n)))} className={`${btnBase} ${sciBtn}`}>sin</button>
                    <button onClick={() => applyUnary((v) => `cos(${v})`, (n) => Math.cos(toRadians(n)))} className={`${btnBase} ${sciBtn}`}>cos</button>
                    <button onClick={() => applyUnary((v) => `tan(${v})`, (n) => Math.tan(toRadians(n)))} className={`${btnBase} ${sciBtn}`}>tan</button>
                    <button
                      onClick={() => setAngleMode((m) => (m === 'deg' ? 'rad' : 'deg'))}
                      className={`${btnBase} ${sciBtn} ring-1 ring-sky-500/40`}
                    >
                      {angleMode.toUpperCase()}
                    </button>

                    <button onClick={() => insertConstant(Math.PI)} className={`${btnBase} ${sciBtn}`}>π</button>
                    <button onClick={() => insertConstant(Math.E)} className={`${btnBase} ${sciBtn}`}>e</button>
                    <button onClick={() => setDisplay((p) => (p.includes('e') ? p : p + 'e'))} className={`${btnBase} ${sciBtn}`}>EE</button>
                    <button onClick={() => insertConstant(Math.random())} className={`${btnBase} ${sciBtn}`}>Rand</button>
                  </div>
                )}

                <div className="grid flex-1 grid-cols-4 gap-2">
                  <button onClick={clearAll} className={`${btnBase} ${funcBtn}`}>AC</button>
                  <button onClick={toggleSign} className={`${btnBase} ${funcBtn}`}>+/-</button>
                  <button onClick={inputPercent} className={`${btnBase} ${funcBtn}`}>%</button>
                  <button onClick={() => performOperation('÷')} className={`${btnBase} ${opBtn(operator === '÷')}`}>÷</button>

                  <button onClick={() => inputDigit('7')} className={`${btnBase} ${digitBtn}`}>7</button>
                  <button onClick={() => inputDigit('8')} className={`${btnBase} ${digitBtn}`}>8</button>
                  <button onClick={() => inputDigit('9')} className={`${btnBase} ${digitBtn}`}>9</button>
                  <button onClick={() => performOperation('×')} className={`${btnBase} ${opBtn(operator === '×')}`}>×</button>

                  <button onClick={() => inputDigit('4')} className={`${btnBase} ${digitBtn}`}>4</button>
                  <button onClick={() => inputDigit('5')} className={`${btnBase} ${digitBtn}`}>5</button>
                  <button onClick={() => inputDigit('6')} className={`${btnBase} ${digitBtn}`}>6</button>
                  <button onClick={() => performOperation('-')} className={`${btnBase} ${opBtn(operator === '-')}`}>−</button>

                  <button onClick={() => inputDigit('1')} className={`${btnBase} ${digitBtn}`}>1</button>
                  <button onClick={() => inputDigit('2')} className={`${btnBase} ${digitBtn}`}>2</button>
                  <button onClick={() => inputDigit('3')} className={`${btnBase} ${digitBtn}`}>3</button>
                  <button onClick={() => performOperation('+')} className={`${btnBase} ${opBtn(operator === '+')}`}>+</button>

                  <button onClick={() => inputDigit('0')} className={`${btnBase} ${digitBtn} col-span-2 !aspect-auto`}>0</button>
                  <button onClick={inputDecimal} className={`${btnBase} ${digitBtn}`}>.</button>
                  <button onClick={handleEquals} className={`${btnBase} ${opBtn(false)}`}>=</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={onResizeMouseDown}
        title="Cambiar tamaño"
        className="absolute bottom-1 right-1 flex h-5 w-5 cursor-nwse-resize items-center justify-center text-zinc-600 hover:text-zinc-400"
      >
        <MoveDiagonal2 className="h-3.5 w-3.5" />
      </div>
    </div>,
    document.body,
  );
});

CalculatorWidget.displayName = 'CalculatorWidget';
