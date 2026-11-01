'use client';

/*
 * Plantilla: copia de components/FinanceChatView.tsx de Finance. Diferencias:
 *  - El motor está en App Master Cloud (lib/aiClient.ts): agentes, motores y
 *    créditos de esta app llegan de la nube; sin `scope` (personal / Master Wolf).
 *  - Textos generales (no "inversiones" ni "asesoría financiera").
 *  - Si la nube aún no tiene llaves de IA, lo avisa.
 */

import { SupportErrorAction } from '@/components/support/SupportErrorAction';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceRecorder } from '@/components/community/VoiceRecorder';
import { AIHistoryPanel } from '@/components/ai/AIHistoryPanel';
import { ChatSidebar } from '@/components/ai/ChatSidebar';
import { ChatMarkdown } from '@/components/ai/ChatMarkdown';
import { EnginePicker } from '@/components/ai/EnginePicker';
import { RandomFactCard, randomFactFrom } from '@/components/ai/RandomFactCard';
import {
  AIAttachment,
  AIConversation,
  AIMessage,
  fetchAvailableEngines,
  loadConversation,
  loadMessages,
  sendAIMessage,
  transcribeAI,
  uploadAIFile,
} from '@/lib/aiClient';
import { AIConversationsStore } from '@/utils/useAIConversations';
import { APP } from '@/app.config';
import { AGENTS, agentById, engineById } from '@/utils/aiCatalog';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  FileText,
  History,
  Loader2,
  Mic,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Square,
  SquarePen,
  X,
} from 'lucide-react';

interface FinanceChatViewProps {
  /** Open this conversation (null = a brand-new chat). */
  conversationId: string | null;
  /** Messages already known (e.g. a report/random that was just generated). */
  initialMessages?: AIMessage[];
  initialConversation?: AIConversation | null;
  store: AIConversationsStore;
  onConversationChange: (c: AIConversation | null) => void;
  onBack: () => void;
  /** "🎲 Otro dato" on a Dato random card. */
  onNewRandom?: () => void;
  randomBusy?: boolean;
}

// Per-viewer conveniences (never critical state).
function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** Reveals a freshly arrived answer progressively (ChatGPT-like), ~1–2.5 s regardless of length. */
function useTypewriter(text: string, active: boolean, onDone: () => void) {
  const [shown, setShown] = useState(active ? 0 : text.length);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!active) {
      setShown(text.length);
      return;
    }
    let raf = 0;
    let n = 0;
    const step = Math.max(2, Math.ceil(text.length / 110));
    const tick = () => {
      n = Math.min(text.length, n + step);
      setShown(n);
      if (n < text.length) raf = requestAnimationFrame(tick);
      else doneRef.current();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, active]);
  return text.slice(0, shown);
}

const AssistantBody: React.FC<{ text: string; animate: boolean; onDone: () => void }> = ({ text, animate, onDone }) => {
  const shown = useTypewriter(text, animate, onDone);
  return (
    <>
      <ChatMarkdown text={shown} />
      {animate && shown.length < text.length && <span className="ml-0.5 inline-block h-3 w-3 animate-pulse rounded-full bg-sky-400 align-middle" />}
    </>
  );
};

const IconBtn: React.FC<{ title: string; onClick: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  <button onClick={onClick} title={title} aria-label={title} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200">
    {children}
  </button>
);

/**
 * The IA chat screen — ChatGPT-style: sidebar with history, engine picker,
 * investment agents, markdown answers with copy/regenerate, edit & resend,
 * voice and attachments. Shared by Chat libre (investments only), Reporte
 * financiero and Dato random. All intelligence lives in lib/ai/.
 */
export const AIChatView: React.FC<FinanceChatViewProps> = ({
  conversationId,
  initialMessages,
  initialConversation,
  store,
  onConversationChange,
  onBack,
  onNewRandom,
  randomBusy,
}) => {
  const [conversation, setConversation] = useState<AIConversation | null>(initialConversation ?? null);
  const [messages, setMessages] = useState<AIMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');
  const [engine, setEngine] = useState('auto');
  const [agent, setAgent] = useState('asistente');
  // false: la nube todavía no tiene llaves de OpenAI / Claude.
  const [configured, setConfigured] = useState(true);
  const [available, setAvailable] = useState<string[] | null>(null);
  const [allowedEngines, setAllowedEngines] = useState<string[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pending, setPending] = useState<AIAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  // A Dato random card opens at its top (it's read like a page), chats open at the latest message.
  const [atBottom, setAtBottom] = useState(initialConversation?.mode !== 'random');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEngine(readPref('mf-ai-engine', 'auto'));
    setAgent(readPref(`mw-ai-agent-${APP.slug}`, 'asistente'));
    setSidebarOpen(readPref('mf-ai-sidebar', '1') === '1');
    fetchAvailableEngines().then((res) => {
      if (!res) return;
      setAvailable(res.engines);
      setAllowedEngines(res.allowed);
      setConfigured(res.configured);
      // Los agentes de esta app llegan con la respuesta (lib/aiClient.ts los guarda en AGENTS).
      setAgent((a) => (res.agents.some((x) => x.id === a) ? a : (res.agents[0]?.id ?? a)));
      // A saved engine the server can't run (or the plan doesn't include) falls back to Auto.
      setEngine((e) => (res.engines.includes(e) && res.allowed.includes(e) ? e : 'auto'));
    });
  }, []);

  // Opening an existing conversation from history loads it from the database.
  useEffect(() => {
    if (!conversationId) {
      if (!initialConversation) {
        setConversation(null);
        setMessages([]);
      }
      return;
    }
    if (initialMessages?.length && initialConversation?.id === conversationId) return;
    // Already showing it (e.g. it was just created by sending the first message).
    if (conversation?.id === conversationId) return;
    let cancelled = false;
    setLoadingHistory(true);
    Promise.all([loadConversation(conversationId), loadMessages(conversationId)]).then(([c, m]) => {
      if (cancelled) return;
      setConversation(c);
      setMessages(m);
      setLoadingHistory(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => {
    if (atBottom) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const pickEngine = (id: string) => {
    setEngine(id);
    writePref('mf-ai-engine', id);
  };
  const pickAgent = (id: string) => {
    setAgent(id);
    writePref(`mw-ai-agent-${APP.slug}`, id);
  };
  const toggleSidebar = (open: boolean) => {
    setSidebarOpen(open);
    writePref('mf-ai-sidebar', open ? '1' : '0');
  };

  const applyResult = (res: { conversation: AIConversation }) => {
    const conv = { ...res.conversation, last_activity_at: new Date().toISOString() };
    setConversation(conv);
    store.upsertLocal(conv);
    onConversationChange(conv);
  };

  const send = async (raw: string, extra: AIAttachment[] = [], opts: { editMessageId?: string; attachments?: AIAttachment[] } = {}) => {
    const text = raw.trim();
    const attachments = opts.attachments ?? [...pending, ...extra];
    if ((!text && attachments.length === 0) || loading) return;
    setError('');
    if (!opts.editMessageId) {
      setInput('');
      setPending([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
    setEditing(null);
    setAnimatingId(null);
    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic: AIMessage = {
      id: tempId,
      conversation_id: conversation?.id ?? '',
      role: 'user',
      content: text,
      attachments,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    const before = messages;
    setMessages((prev) => {
      const cut = opts.editMessageId ? prev.slice(0, Math.max(0, prev.findIndex((m) => m.id === opts.editMessageId))) : prev;
      return [...cut, optimistic];
    });
    setAtBottom(true);
    setLoading(true);
    try {
      const res = await sendAIMessage({
        conversationId: conversation?.id ?? null,
        text,
        attachments,
        engine,
        agent,
        editMessageId: opts.editMessageId ?? null,
      });
      setMessages((prev) => [...prev.filter((m) => m.id !== tempId), ...(res.userMessage ? [res.userMessage] : []), res.assistantMessage]);
      setAnimatingId(res.assistantMessage.id);
      applyResult(res);
    } catch (e) {
      setMessages(before);
      if (!opts.editMessageId) {
        setInput(text);
        setPending(attachments.filter((a) => a.kind !== 'audio'));
      }
      setError(e instanceof Error ? e.message : 'No se pudo conectar. Intenta de nuevo.');
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const regenerate = async () => {
    if (!conversation || loading) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    setError('');
    setAnimatingId(null);
    setMessages((prev) => prev.slice(0, -1));
    setLoading(true);
    try {
      const res = await sendAIMessage({ conversationId: conversation.id, text: '', engine, regenerate: true });
      setMessages((prev) => [...prev, res.assistantMessage]);
      setAnimatingId(res.assistantMessage.id);
      applyResult(res);
    } catch (e) {
      setMessages((prev) => [...prev, last]);
      setError(e instanceof Error ? e.message : 'No se pudo regenerar la respuesta.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (m: AIMessage) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
    } catch {
      setError('No se pudo copiar.');
    }
  };

  const attachFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo es muy pesado (máximo 10 MB).');
      return;
    }
    setUploading(true);
    try {
      const att = await uploadAIFile(file, file.name, 'files');
      setPending((p) => [...p, att].slice(0, 4));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo.');
    } finally {
      setUploading(false);
    }
  };

  // Voice: record → upload original → transcribe → send the transcript as the message.
  const sendVoice = async (blob: Blob, seconds: number) => {
    setUploading(true);
    setError('');
    try {
      const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
      const att = await uploadAIFile(blob, `voz.${ext}`, 'audio');
      const { text, seconds: s } = await transcribeAI(att.path, conversation?.id ?? null);
      setUploading(false);
      if (!text.trim()) {
        setError('No se entendió el audio. Intenta de nuevo.');
        return;
      }
      await send(text, [{ ...att, kind: 'audio', transcript: text, seconds: s || seconds }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar el audio.');
    } finally {
      setUploading(false);
    }
  };

  const newConversation = () => {
    setConversation(null);
    setMessages([]);
    setError('');
    setPending([]);
    setEditing(null);
    setAnimatingId(null);
    onConversationChange(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const openConversation = (c: AIConversation) => {
    setHistoryOpen(false);
    setConversation(c);
    onConversationChange(c);
    setEditing(null);
    setAnimatingId(null);
    setLoadingHistory(true);
    loadMessages(c.id).then((m) => {
      setMessages(m);
      setLoadingHistory(false);
      setAtBottom(true);
    });
  };

  const isEmpty = messages.length === 0 && !loadingHistory;
  const activeAgent = agentById(conversation?.mode === 'chat' ? conversation.metadata?.agent ?? agent : agent);
  const typing = animatingId !== null;
  const lastId = messages[messages.length - 1]?.id;
  const canRegenerate = (i: number) => i === messages.length - 1 && i > 0 && messages[i - 1].role === 'user' && !loading;
  const subtitle =
    conversation?.mode === 'report' ? '📊 Reporte financiero' : conversation?.mode === 'random' ? '🎲 Dato random' : `${activeAgent.emoji} ${activeAgent.name}`;

  const composer = (
    <div className="w-full">
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pending.map((a) => (
            <span key={a.path} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-[#16171b] px-2.5 py-1 text-[11px] text-zinc-300">
              <FileText className="h-3.5 w-3.5 text-sky-400" /> {a.name}
              <button onClick={() => setPending((p) => p.filter((x) => x.path !== a.path))} className="text-zinc-500 hover:text-rose-400">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5 rounded-[26px] border border-zinc-700/70 bg-[#16171b] p-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)] focus-within:border-zinc-600">
        {!recording && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || loading}
            title="Adjuntar imagen, PDF o documento"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-300 hover:bg-white/[0.08] disabled:opacity-40"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,application/pdf,text/*,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) attachFile(f);
          }}
        />
        {!recording && (
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={conversation && conversation.mode !== 'chat' ? 'Escribe tu respuesta…' : 'Pregunta lo que quieras sobre tus números o la app…'}
            className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-white placeholder:text-zinc-500 focus:outline-none"
          />
        )}
        {!recording && (typing || loading) ? (
          <button
            onClick={() => setAnimatingId(null)}
            disabled={loading}
            title={loading ? 'Pensando…' : 'Mostrar todo'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
          </button>
        ) : (
          !recording &&
          (input.trim() || pending.length > 0) && (
            <button onClick={() => send(input)} title="Enviar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105">
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )
        )}
        {/* Always mounted in the same spot (see VoiceRecorder's own notes). */}
        <VoiceRecorder onSend={sendVoice} onActiveChange={setRecording} hideIdleButton={Boolean(input.trim() || pending.length || typing || loading)} />
      </div>
    </div>
  );

  return (
    <section className="fixed inset-0 z-50 flex bg-[#0b0c0f] text-white">
      {sidebarOpen && (
        <div className="hidden lg:block">
          <ChatSidebar
            conversations={store.conversations}
            activeId={conversation?.id ?? null}
            onOpen={openConversation}
            onNew={newConversation}
            onCollapse={() => toggleSidebar(false)}
            onOpenLibrary={() => setHistoryOpen(true)}
          />
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-1">
            <button onClick={onBack} title="Volver" aria-label="Volver" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </button>
            {!sidebarOpen && (
              <button onClick={() => toggleSidebar(true)} title="Abrir barra lateral" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white lg:flex">
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            )}
            <EnginePicker value={engine} onChange={pickEngine} available={available} allowed={allowedEngines} />
          </div>

          {conversation && (
            <div className="hidden min-w-0 flex-1 justify-center md:flex">
              {editingTitle ? (
                <input
                  autoFocus
                  defaultValue={conversation.title}
                  onBlur={async (e) => {
                    setEditingTitle(false);
                    const t = e.target.value.trim();
                    if (t && t !== conversation.title) {
                      await store.rename(conversation.id, t);
                      setConversation({ ...conversation, title: t, title_locked: true });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingTitle(false);
                  }}
                  className="w-72 rounded-lg bg-white/[0.06] px-3 py-1 text-center text-sm text-white focus:outline-none"
                />
              ) : (
                <button onClick={() => setEditingTitle(true)} className="group flex max-w-md flex-col items-center rounded-lg px-3 py-0.5 hover:bg-white/[0.04]" title="Cambiar título">
                  <span className="flex max-w-full items-center gap-1.5 text-sm text-zinc-200">
                    <span className="truncate">{conversation.title}</span>
                    <Pencil className="h-3 w-3 shrink-0 text-zinc-600 group-hover:text-zinc-300" />
                  </span>
                  <span className="text-[11px] text-zinc-500">{subtitle}</span>
                </button>
              )}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-0.5">
            <button onClick={() => setHistoryOpen(true)} title="Historial" className={`flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white ${sidebarOpen ? 'lg:hidden' : ''}`}>
              <History className="h-5 w-5" />
            </button>
            <button onClick={newConversation} title="Nuevo chat" className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white">
              <SquarePen className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          {loadingHistory ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
            </div>
          ) : isEmpty ? (
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-8">
              <span className="text-5xl">{activeAgent.emoji}</span>
              <h1 className="font-display mt-4 text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">¿En qué te ayudo hoy?</h1>
              <p className="mt-2 text-center text-sm text-zinc-400">
                Hablas con <span className="text-zinc-200">{activeAgent.name}</span> · {activeAgent.tagline}
              </p>

              <div className="mt-6 flex w-full flex-wrap justify-center gap-2">
                {AGENTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => pickAgent(a.id)}
                    className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      a.id === activeAgent.id ? 'border-sky-400/60 bg-sky-500/15 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                    }`}
                    title={a.tagline}
                  >
                    <span>{a.emoji}</span> {a.name}
                  </button>
                ))}
              </div>

              <div className="mt-6 w-full">{composer}</div>

              <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
                {activeAgent.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-2xl border border-zinc-800 px-4 py-3 text-left text-sm text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
              {!configured && (
                <p className="mt-6 rounded-xl bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-200 ring-1 ring-amber-400/30">
                  La IA de App Master Cloud todavía no tiene sus llaves configuradas. Pronto estará lista.
                </p>
              )}
              <p className="mt-6 text-center text-[11px] text-zinc-600">La IA puede equivocarse. Revisa la información importante.</p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-10 pt-4 sm:px-6">
              {messages.map((m, i) => {
                if (m.role === 'user') {
                  const files = m.attachments?.filter((a) => a.kind !== 'audio') ?? [];
                  const isEditing = editing?.id === m.id;
                  return (
                    <div key={m.id} className="group flex flex-col items-end gap-1.5">
                      {files.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {files.map((a) => (
                            <span key={a.path} className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#16171b] px-3 py-2 text-xs text-zinc-300">
                              <FileText className="h-4 w-4 text-sky-400" /> {a.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {isEditing ? (
                        <div className="w-full rounded-3xl bg-[#1e1f24] p-3">
                          <textarea
                            autoFocus
                            value={editing.text}
                            onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setEditing(null);
                              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                send(editing.text, [], { editMessageId: m.id, attachments: m.attachments });
                              }
                            }}
                            rows={Math.min(8, Math.max(2, editing.text.split('\n').length))}
                            className="w-full resize-none bg-transparent px-2 py-1 text-[15px] text-white focus:outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditing(null)} className="rounded-full bg-white/[0.08] px-3.5 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.12]">
                              Cancelar
                            </button>
                            <button
                              onClick={() => send(editing.text, [], { editMessageId: m.id, attachments: m.attachments })}
                              disabled={!editing.text.trim() || loading}
                              className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-black disabled:opacity-50"
                            >
                              Enviar
                            </button>
                          </div>
                        </div>
                      ) : (
                        m.content && (
                          <>
                            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-[#1c1d22] px-4 py-2.5 text-[15px] leading-relaxed text-zinc-100">
                              {m.attachments?.some((a) => a.kind === 'audio') && <Mic className="mb-0.5 mr-1.5 inline h-3.5 w-3.5 text-zinc-400" />}
                              {m.content}
                            </div>
                            {!m.id.startsWith('tmp-') && (
                              <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                                <IconBtn title={copiedId === m.id ? 'Copiado' : 'Copiar'} onClick={() => copy(m)}>
                                  {copiedId === m.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </IconBtn>
                                {!loading && (
                                  <IconBtn title="Editar mensaje" onClick={() => setEditing({ id: m.id, text: m.content })}>
                                    <Pencil className="h-4 w-4" />
                                  </IconBtn>
                                )}
                              </div>
                            )}
                          </>
                        )
                      )}
                    </div>
                  );
                }

                const fact = conversation?.mode === 'random' && i === 0 ? randomFactFrom(m.content, m.metadata ?? {}) : null;
                if (fact) {
                  return (
                    <RandomFactCard
                      key={m.id}
                      fact={fact}
                      category={typeof m.metadata?.category === 'string' ? m.metadata.category : undefined}
                      onReply={messages.length === 1 ? (t) => send(t) : undefined}
                      onAnother={onNewRandom}
                      anotherBusy={randomBusy}
                    />
                  );
                }

                const animate = m.id === animatingId;
                const engineLabel = typeof m.metadata?.engine === 'string' && m.metadata.engine !== 'auto' ? engineById(m.metadata.engine).label : null;
                return (
                  <div key={m.id} className="group">
                    <div className="text-[15px] leading-7 text-zinc-200">
                      <AssistantBody text={m.content} animate={animate} onDone={() => setAnimatingId((id) => (id === m.id ? null : id))} />
                    </div>
                    {!animate && (
                      <div className={`mt-2 flex items-center gap-0.5 transition-opacity ${m.id === lastId ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 max-md:opacity-100'}`}>
                        <IconBtn title={copiedId === m.id ? 'Copiado' : 'Copiar'} onClick={() => copy(m)}>
                          {copiedId === m.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </IconBtn>
                        {canRegenerate(i) && (
                          <IconBtn title="Regenerar respuesta" onClick={regenerate}>
                            <RefreshCw className="h-4 w-4" />
                          </IconBtn>
                        )}
                        {engineLabel && <span className="ml-1.5 text-[11px] text-zinc-600">{engineLabel}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400" />
                  </span>
                  Pensando…
                </div>
              )}
            </div>
          )}
        </div>

        {!atBottom && !isEmpty && (
          <button
            onClick={() => {
              setAtBottom(true);
              scrollToBottom(true);
            }}
            title="Ir al final"
            className="absolute bottom-32 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-zinc-700 bg-[#16171b] text-zinc-300 shadow-lg hover:text-white"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}

        {error && (
          <div className="mx-auto w-full max-w-3xl px-4">
            <p className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-4 py-2 text-xs text-rose-300 ring-1 ring-rose-500/30">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                {error}
                <SupportErrorAction feature="Chat de IA" error={error} className="mt-1.5 flex" />
              </span>
              <button onClick={() => setError('')} className="text-rose-300/70 hover:text-rose-200">
                <X className="h-3.5 w-3.5" />
              </button>
            </p>
          </div>
        )}

        {!isEmpty && (
          <div className="mx-auto w-full max-w-3xl px-3 pb-3 pt-2 sm:px-6 sm:pb-4">
            {composer}
            <p className="mt-2 text-center text-[11px] text-zinc-600">
              La IA puede equivocarse. Revisa la información importante.
            </p>
          </div>
        )}
      </div>

      {historyOpen && <AIHistoryPanel store={store} activeId={conversation?.id ?? null} onOpen={openConversation} onClose={() => setHistoryOpen(false)} />}
    </section>
  );
};
