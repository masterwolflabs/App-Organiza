'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Send, Sparkles, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { ChatMarkdown } from '@/components/ai/ChatMarkdown';
import { fetchAvailableEngines, loadMessages, sendAIMessage, type AIMessage } from '@/lib/aiClient';
import { ENGINE_OPTIONS } from '@/utils/aiCatalog';
import { useConfirm } from '@/components/ui/confirm';
import { MicButton } from '@/components/organiza/DayAdjust';
import { marksFromActions, setMarks } from '@/components/organiza/aiMarks';
import { runAIActions } from '@/components/organiza/aiExecutor';
import type { useHorario } from '@/components/organiza/useHorario';
import type { useCalendar } from '@/components/calendar/useCalendar';
import { jarvisScreen, readEngine, readJarvisConv, resultsOf, saveActionResults, writeJarvisConv } from '@/components/organiza/jarvis';

/**
 * La IA al lado del Horario (Emanuel, 2026-11-04): conversas y lo que pide se hace en vivo en la
 * pantalla de al lado (crear, editar, mover, reacomodar, eventos del calendario…). Borrar pregunta antes
 * y todo lo de una respuesta se deshace con ↶.
 */
const IDEAS = [
  '¿Qué tareas de mi horario no tienen categoría?',
  'Agrega «Leer» de lunes a viernes a las 22:00 por 30 min',
  'Activa la notificación en todas las tareas que no tienen aviso',
  'Agenda una cena el viernes de 21:00 a 22:00',
];

export const AIPanel: React.FC<{ h: ReturnType<typeof useHorario>; cal: Pick<ReturnType<typeof useCalendar>, 'save' | 'remove' | 'events'>; /** A message to send as soon as it opens (the schedule hint). */ initial?: string | null; /** Desde dónde se abrió (Horario / Calendario). */ where?: string; onClose: () => void }> = ({ h, cal, initial, where = 'Horario', onClose }) => {
  // 🤖 Jarvis: la misma conversación que la sección IA (jarvis.ts).
  const [convId, setConvId] = useState<string | null>(() => readJarvisConv());
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [results, setResults] = useState<Record<string, string[]>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = useConfirm();
  const end = useRef<HTMLDivElement>(null);
  // Motor (OpenAI o Claude): el mismo que se elige en la sección IA; solo los que la nube permite y tiene llave.
  const [engine, setEngine] = useState(() => readEngine());
  const [engines, setEngines] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    fetchAvailableEngines().then((info) => {
      if (!info) return;
      setEngines(ENGINE_OPTIONS.filter((o) => info.allowed.includes(o.id) && info.engines.includes(o.id)).map((o) => ({ id: o.id, label: o.label })));
    });
  }, []);
  const pickEngine = (id: string) => {
    setEngine(id);
    try {
      localStorage.setItem('mf-ai-engine', id);
    } catch {
      /* modo privado */
    }
  };
  // Lo último de la pantalla para ejecutar (h cambia en cada render).
  const live = useRef({ h, cal });
  live.current = { h, cal };

  // Solo se carga el historial al abrir (o al cambiar de conversación desde fuera): cuando la conversación nace en
  // este panel, ya tenemos los mensajes y recargar borraría el resultado recién aplicado.
  const ownConv = useRef<string | null>(null);
  useEffect(() => {
    if (convId && convId !== ownConv.current)
      loadMessages(convId)
        .then((m) => {
          const last = m.slice(-30);
          setMessages(last);
          setResults(Object.fromEntries(last.filter((x) => resultsOf(x).length).map((x) => [x.id, resultsOf(x)])));
        })
        .catch(() => {});
  }, [convId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior });
  }, [messages, busy, results]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sentInitial = useRef(false);
  useEffect(() => {
    if (!initial || sentInitial.current) return;
    sentInitial.current = true;
    send(initial);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = () => {
    setConvId(null);
    setMessages([]);
    setResults({});
    writeJarvisConv(null);
  };

  const send = async (raw?: string) => {
    const msg = (raw ?? text).trim();
    if (!msg || busy) return;
    setText('');
    setError('');
    setBusy(true);
    const temp: AIMessage = { id: `tmp-${Date.now()}`, conversation_id: convId ?? '', role: 'user', content: msg, attachments: [], metadata: {}, created_at: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    const screen = jarvisScreen(`el panel de Jarvis al lado del ${where} (aquí puede aplicar cambios del Horario y del Calendario en vivo)`, [
      `Horario abierto: «${h.active?.name ?? 'sin horario'}»${h.active ? ` (${h.active.status})` : ''}. Horarios: ${h.schedules.map((s) => `${s.name} (${s.status})`).join(', ') || 'ninguno'}.`,
      'Si cuenta algo grande que cambia sus días (viaje, enfermedad, un familiar enfermo, mudanza, una catástrofe) o que su semana se está moviendo mucho, ofrécele dos caminos simples: cambiar su horario de verdad (horario_editar_tareas) o un horario provisorio por unos días (horarios_gestionar con accion «provisorio», dias y motivo: copia el horario solo para esos días y después vuelve solo el normal). Pregunta cuál prefiere antes de hacerlo.',
      'Lo que pida, HAZLO con tus herramientas (horario_crear_tareas, horario_editar_tareas, dia_reacomodar, calendario_guardar_evento, etc.): se aplica en su pantalla y lo puede deshacer. Antes de editar o borrar, lee con get_horario o get_calendario. Responde corto y en tuteo.',
    ]);
    try {
      const res = await sendAIMessage({ conversationId: convId, text: msg, engine, screen });
      const id = res.conversation.id;
      if (id !== convId) {
        ownConv.current = id;
        setConvId(id);
        writeJarvisConv(id);
      }
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), ...(res.userMessage ? [res.userMessage] : [temp]), res.assistantMessage]);
      const actions = res.assistantMessage.metadata?.actions;
      const marks = marksFromActions(actions);
      if (marks) setMarks(marks);
      const lines = await runAIActions(actions, { ...live.current, confirm });
      if (lines.length) {
        setResults((r) => ({ ...r, [res.assistantMessage.id]: lines }));
        // Lo que pasó de verdad queda en el mensaje: Jarvis lo lee en el turno siguiente.
        saveActionResults(res.assistantMessage, lines).catch(() => {});
        // Las otras pantallas abiertas (ej. el calendario) se recargan solas al «volver el foco».
        window.dispatchEvent(new Event('focus'));
      }
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setText(msg);
      setError(e instanceof Error ? e.message : 'No se pudo conectar con la IA.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BodyPortal>
      <aside role="dialog" aria-label="Jarvis" className="fixed inset-y-0 right-0 z-[90] flex w-full flex-col border-l border-white/10 bg-[#111317]/95 shadow-2xl backdrop-blur-xl sm:w-[400px]">
        <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600"><Sparkles className="h-4 w-4 text-[#fff]" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">Jarvis</p>
            <p className="text-xs text-zinc-400">Lo que pidas se aplica en vivo · ↶ para deshacer</p>
          </div>
          {engines.length > 1 && (
            <select value={engine} onChange={(e) => pickEngine(e.target.value)} aria-label="Motor de IA" data-help="Motor de IA (OpenAI o Claude): mismo Jarvis, mismas herramientas" className="max-w-[110px] rounded-lg bg-white/[0.06] px-1.5 py-1 text-[11px] font-semibold text-zinc-200 outline-none ring-1 ring-white/10">
              {engines.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          <button type="button" onClick={fresh} data-help="Conversación nueva" aria-label="Conversación nueva" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!messages.length && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-300">Pídeme lo que quieras de tu horario o tu calendario. Por ejemplo:</p>
              {IDEAS.map((t) => (
                <button key={t} type="button" onClick={() => send(t)} className="block w-full rounded-xl bg-white/[0.04] px-3 py-2 text-left text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.08]">{t}</button>
              ))}
            </div>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ml-8 rounded-2xl rounded-br-md bg-sky-600/25 px-3 py-2 text-sm text-white ring-1 ring-sky-400/20">{m.content}</div>
            ) : (
              <div key={m.id} className="space-y-2 text-sm leading-6 text-zinc-200">
                <ChatMarkdown text={m.content} />
                {results[m.id]?.length ? (
                  <div className="space-y-0.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 ring-1 ring-emerald-400/25">
                    {results[m.id].map((l, k) => <p key={k}>{l}</p>)}
                  </div>
                ) : null}
              </div>
            ),
          )}
          {busy && <p className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Trabajando en tu horario…</p>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div ref={end} />
        </div>

        <form className="border-t border-white/10 p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <div className="flex items-end gap-1.5 rounded-2xl bg-white/[0.05] p-1.5 ring-1 ring-white/10 focus-within:ring-fuchsia-400/50">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              placeholder="Ej.: mueve Entrenar a las 7:00 los martes"
              className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-zinc-500"
            />
            <MicButton onText={(t) => setText((x) => (x.trim() ? `${x.trim()} ${t}` : t))} />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar" className="rounded-xl bg-fuchsia-600 p-2 text-[#fff] hover:bg-fuchsia-500 disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </div>
        </form>
      </aside>
    </BodyPortal>
  );
};
