'use client';

import React, { useEffect, useState } from 'react';
import { NoteEditor } from '@/components/notes/NoteEditor';
import { NoteViewMode, colorOf } from '@/utils/notes';
import { NoteColor } from '@/types/notes';
import { Popover } from '@/components/notes/NoteMenus';
import { AppWindow, Maximize2, Minus, PanelLeft, PanelRight, RectangleHorizontal, StickyNote, X } from 'lucide-react';

type Edge = 'right' | 'left';
const MODES: { key: NoteViewMode; edge?: Edge; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'side', edge: 'right', label: 'Vista lateral derecha', icon: PanelRight },
  { key: 'side', edge: 'left', label: 'Vista lateral izquierda', icon: PanelLeft },
  { key: 'center', label: 'Vista central', icon: RectangleHorizontal },
  { key: 'floating', label: 'Ventana flotante', icon: AppWindow },
  { key: 'full', label: 'Pantalla completa', icon: Maximize2 },
];

const MIN_W = 360;
const MIN_H = 320;
const EDGE = 8;
const SIDE_MIN = 340;
const readLS = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return desktop;
}

type EditorProps = Omit<React.ComponentProps<typeof NoteEditor>, 'layout' | 'headerExtras' | 'onHeaderPointerDown'>;

interface NoteWindowProps extends EditorProps {
  mode: NoteViewMode;
  onModeChange: (mode: NoteViewMode) => void;
}

/**
 * Hosts the note editor in one of four desktop view modes (Notion-style
 * discreet switcher in the header). On phones a note always opens full
 * screen. The editor lives inside ONE stable wrapper element across every
 * mode (only its classes/styles change) so switching modes — or minimizing
 * the floating window — never remounts it and never loses unsaved typing.
 */
export const NoteWindow: React.FC<NoteWindowProps> = ({ mode, onModeChange, ...editorProps }) => {
  const isDesktop = useIsDesktop();
  const effective: NoteViewMode = isDesktop ? mode : 'full';
  const [minimized, setMinimized] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rect, setRect] = useState(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const w = Math.min(560, vw - 2 * EDGE);
    const h = Math.min(640, vh - 2 * EDGE);
    return { x: Math.max(EDGE, vw - w - 96), y: Math.max(EDGE, (vh - h) / 2), w, h };
  });

  useEffect(() => {
    if (effective !== 'floating') setMinimized(false);
  }, [effective]);

  // Side view (Emanuel, 2026-10-27): right OR left, its width adjustable by dragging the inner edge, and
  // it PUSHES the page aside (body padding + any fixed full-screen shell marked [data-push-root]) so you
  // can keep working next to it. Edge and width are remembered.
  const [edge, setEdge] = useState<Edge>(() => (readLS('mf-note-side-edge') === 'left' ? 'left' : 'right'));
  const [sideW, setSideW] = useState(() => Number(readLS('mf-note-side-w')) || 520);
  const sideWidth = typeof window !== 'undefined' ? clamp(sideW, SIDE_MIN, window.innerWidth * 0.8) : sideW;
  useEffect(() => {
    if (effective !== 'side') return;
    const prop = edge === 'left' ? 'paddingLeft' : 'paddingRight';
    const targets = [document.body, ...Array.from(document.querySelectorAll<HTMLElement>('[data-push-root]'))];
    const before = targets.map((el) => el.style[prop]);
    targets.forEach((el) => {
      el.style[prop] = `${sideWidth}px`;
    });
    return () => targets.forEach((el, i) => (el.style[prop] = before[i]));
  }, [effective, edge, sideWidth]);
  const startSideResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      const w = clamp(edge === 'right' ? window.innerWidth - ev.clientX : ev.clientX, SIDE_MIN, window.innerWidth * 0.8);
      setSideW(w);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setSideW((w) => (writeLS('mf-note-side-w', String(Math.round(w))), w));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    const onResize = () =>
      setRect((r) => {
        const w = Math.min(r.w, window.innerWidth - 2 * EDGE);
        const h = Math.min(r.h, window.innerHeight - 2 * EDGE);
        return { w, h, x: clamp(r.x, EDGE, window.innerWidth - w - EDGE), y: clamp(r.y, EDGE, window.innerHeight - h - EDGE) };
      });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    if (effective !== 'floating') return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const start = rect;
    const onMove = (ev: PointerEvent) =>
      setRect((r) => ({
        ...r,
        x: clamp(start.x + ev.clientX - sx, EDGE, window.innerWidth - r.w - EDGE),
        y: clamp(start.y + ev.clientY - sy, EDGE, window.innerHeight - r.h - EDGE),
      }));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Floating window: resize from any edge or corner (dir = which sides move: n/s/e/w). */
  const startResize = (dir: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const start = rect;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      let { x, y, w, h } = start;
      if (dir.includes('e')) w = clamp(start.w + dx, MIN_W, window.innerWidth - start.x - EDGE);
      if (dir.includes('s')) h = clamp(start.h + dy, MIN_H, window.innerHeight - start.y - EDGE);
      if (dir.includes('w')) {
        x = clamp(start.x + dx, EDGE, start.x + start.w - MIN_W);
        w = start.w + (start.x - x);
      }
      if (dir.includes('n')) {
        y = clamp(start.y + dy, EDGE, start.y + start.h - MIN_H);
        h = start.h + (start.y - y);
      }
      setRect({ x, y, w, h });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const current = MODES.find((m) => m.key === effective && (!m.edge || m.edge === edge)) ?? MODES[4];
  const btn = 'flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100';

  const headerExtras = isDesktop ? (
    <>
      <Popover
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        width="w-48"
        anchor={
          <button onClick={() => setMenuOpen((v) => !v)} title="Cómo ver esta nota" className={btn}>
            <current.icon className="h-4 w-4" />
          </button>
        }
      >
        {MODES.map((m) => (
          <button
            key={m.label}
            onClick={() => {
              if (m.edge) {
                setEdge(m.edge);
                writeLS('mf-note-side-edge', m.edge);
              }
              onModeChange(m.key);
              setMenuOpen(false);
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs ${
              current.label === m.label ? 'text-sky-400' : 'text-zinc-300 hover:bg-white/5'
            }`}
          >
            <m.icon className="h-3.5 w-3.5" />
            {m.label}
          </button>
        ))}
      </Popover>
      {effective === 'floating' && (
        <button onClick={() => setMinimized(true)} title="Minimizar" className={btn}>
          <Minus className="h-4 w-4" />
        </button>
      )}
    </>
  ) : null;

  const wrapperClass =
    effective === 'full'
      ? 'fixed inset-0 z-[85]'
      : effective === 'side'
      ? `fixed inset-y-0 z-[85] overflow-hidden ${edge === 'left' ? 'left-0 border-r shadow-[24px_0_48px_-16px_rgba(0,0,0,0.7)]' : 'right-0 border-l shadow-[-24px_0_48px_-16px_rgba(0,0,0,0.7)]'} border-white/10`
      : effective === 'center'
      ? 'fixed left-1/2 top-1/2 z-[85] h-[86vh] w-[min(820px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 shadow-2xl lg:w-1/2'
      : 'fixed z-[85] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/70';

  const title = editorProps.initial.title.trim() || 'Nota';

  return (
    <>
      {effective === 'center' && <div className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-[2px]" />}
      <div
        className={`${wrapperClass} ${minimized ? 'hidden' : ''}`}
        style={effective === 'floating' ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : effective === 'side' ? { width: sideWidth } : undefined}
      >
        <NoteEditor
          {...editorProps}
          layout={effective === 'full' ? 'full' : 'panel'}
          headerExtras={headerExtras}
          onHeaderPointerDown={effective === 'floating' ? startDrag : undefined}
        />
        {effective === 'side' && (
          // Drag the inner edge to make the side view wider or narrower.
          <span
            onPointerDown={startSideResize}
            title="Arrastra para cambiar el ancho"
            className={`group absolute inset-y-0 z-20 w-2 cursor-col-resize ${edge === 'right' ? 'left-0' : 'right-0'}`}
          >
            <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition group-hover:bg-sky-400/70" />
          </span>
        )}
        {effective === 'floating' && (
          <>
            {/* Every edge and corner resizes the floating window. */}
            <span onPointerDown={startResize('n')} className="absolute inset-x-3 top-0 z-20 h-1.5 cursor-ns-resize" />
            <span onPointerDown={startResize('s')} className="absolute inset-x-3 bottom-0 z-20 h-1.5 cursor-ns-resize" />
            <span onPointerDown={startResize('w')} className="absolute inset-y-3 left-0 z-20 w-1.5 cursor-ew-resize" />
            <span onPointerDown={startResize('e')} className="absolute inset-y-3 right-0 z-20 w-1.5 cursor-ew-resize" />
            <span onPointerDown={startResize('nw')} className="absolute left-0 top-0 z-20 h-3 w-3 cursor-nwse-resize" />
            <span onPointerDown={startResize('ne')} className="absolute right-0 top-0 z-20 h-3 w-3 cursor-nesw-resize" />
            <span onPointerDown={startResize('sw')} className="absolute bottom-0 left-0 z-20 h-3 w-3 cursor-nesw-resize" />
            <span
              onPointerDown={startResize('se')}
              title="Cambiar tamaño"
              className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-nwse-resize"
              style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(120,120,130,0.55) 50%)' }}
            />
          </>
        )}
      </div>
      {minimized && (
        <div className="fixed bottom-24 right-6 z-[85] flex items-center gap-1 rounded-full border border-white/10 bg-[#16171c] py-1.5 pl-3 pr-1.5 shadow-2xl md:bottom-6">
          <span className={`h-2.5 w-2.5 rounded-full ${colorOf(editorProps.initial.color as NoteColor).swatch}`} />
          <button onClick={() => setMinimized(false)} className="flex max-w-[200px] items-center gap-1.5 truncate px-1.5 text-xs font-medium text-zinc-200">
            <StickyNote className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <span className="truncate">{title}</span>
          </button>
          <button onClick={() => setMinimized(false)} title="Expandir" className="rounded-full p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={editorProps.onClose} title="Cerrar" className="rounded-full p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
