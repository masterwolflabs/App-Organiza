'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, PhoneOff, Sparkles, X } from 'lucide-react';
import { authFetch } from '@/lib/authFetch';
import { APP } from '@/app.config';
import { cloudAI } from '@/lib/aiClient';

/**
 * Plantilla: copia de components/ai/VoiceAssistant.tsx de Finance. Diferencias:
 * la voz vive en App Master Cloud (`${APP.cloudUrl}/api/ai/voice/*`, con el
 * `app` de esta app y sus `sections` para navegar); sin `scope`. El modo
 * Master Wolf Control es de Finance (la nube no lo activa).
 *
 * Asistente de voz en tiempo real (Emanuel, 2026-10-21): a floating button.
 * On → mic + OpenAI Realtime over WebRTC (our server mints the short-lived
 * key: /api/ai/voice/session). It knows the same as the chat (data tools run
 * on our server with the user's token: /api/ai/voice/tool) and can take the
 * user anywhere in the app (navigate_to, handled here). Knows the current
 * screen (where_am_i + a note each time the screen changes). Doesn't change
 * data and isn't part of the tour.
 */

export type VoiceStatus = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';
type Status = VoiceStatus;
export type VoiceAssistantHandle = { toggle: () => void };
type Call = { call_id: string; name: string; arguments: string };

export const VoiceAssistant = forwardRef<
  VoiceAssistantHandle,
  {
    /** Secciones de la app a las que puede llevar (clave → nombre). */
    sections: Record<string, string>;
    /** What the user is looking at ("Empresa", "Transferencias"…). */
    where: string;
    onNavigate: (section: string, part?: string) => void;
    /** First name, for the greeting ("Hola, Emanuel…"). */
    userName?: string;
    /** The robot lives in the quick-actions dial (bottom-right): no own button, panel on the right. */
    inDial?: boolean;
    onStatus?: (s: VoiceStatus) => void;
  }
>(function VoiceAssistant({ sections, where, onNavigate, userName, inDial, onStatus }, ref) {
  const [status, setStatus] = useState<Status>('off');
  const [said, setSaid] = useState('');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  // Master Wolf Control (founders only, unlocked by name + code on the server).
  const [control, setControl] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // What this call has cost so far (US$), shown in the panel — voice is the priciest AI in the app.
  const [spent, setSpent] = useState(0);
  // Hang up by itself after a while with nobody talking (cost).
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_MS = 60_000;
  const touch = () => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      setError('Corté por inactividad para no gastar créditos. Tócame cuando quieras seguir.');
      stopRef.current();
      setStatus('error');
    }, IDLE_MS);
  };
  const stopRef = useRef<() => void>(() => {});
  const base = useRef<{ instructions: string; tools: unknown[] }>({ instructions: '', tools: [] });
  const extra = useRef<{ instructions: string; tools: unknown[] } | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const whereRef = useRef(where);
  whereRef.current = where;
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;

  useEffect(() => onStatus?.(status), [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = (ev: unknown) => dc.current?.readyState === 'open' && dc.current.send(JSON.stringify(ev));

  const stop = () => {
    dc.current?.close();
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    pc.current = null;
    dc.current = null;
    mic.current = null;
    setStatus('off');
    setMuted(false);
    setControl(false);
    extra.current = null;
    if (idle.current) clearTimeout(idle.current);
  };
  stopRef.current = stop;
  const applySession = () =>
    send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: `${base.current.instructions}${extra.current?.instructions ?? ''}\n\nPantalla actual del usuario: ${whereRef.current}.`,
        tools: [...base.current.tools, ...(extra.current?.tools ?? [])],
        tool_choice: 'auto',
        // Old turns are dropped once the history passes ~6k tokens: every answer re-reads the history.
        truncation: { type: 'retention_ratio', retention_ratio: 0.7, token_limits: { post_instructions: 6000 } },
      },
    });
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tell the model when the user moves to another screen.
  useEffect(() => {
    if (status === 'off' || status === 'connecting') return;
    send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: `El usuario ahora está en la pantalla: ${where}.` }] } });
  }, [where]); // eslint-disable-line react-hooks/exhaustive-deps

  const runCalls = async (calls: Call[]) => {
    setStatus('thinking');
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.arguments || '{}');
      } catch {
        /* ignore */
      }
      let output: string;
      if (c.name === 'navigate_to') {
        navRef.current(String(args.section ?? 'inicio'), typeof args.part === 'string' ? args.part : undefined);
        output = JSON.stringify({ ok: true, ahora_en: String(args.section) });
      } else if (c.name === 'where_am_i') {
        output = JSON.stringify({ pantalla: whereRef.current });
      } else if (c.name === 'copy_to_clipboard' && extra.current) {
        const text = String(args.text ?? '');
        setCopied(text);
        const ok = await navigator.clipboard?.writeText(text).then(() => true).catch(() => false);
        output = JSON.stringify(ok ? { ok: true } : { ok: false, aviso: 'El navegador no dejó copiar solo: el texto quedó en el recuadro con un botón Copiar.' });
      } else if (c.name === 'mw_control_off') {
        extra.current = null;
        setControl(false);
        applySession();
        output = JSON.stringify({ ok: true });
      } else {
        const r = await authFetch(cloudAI('/api/ai/voice/tool'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: c.name, args, app: APP.slug }) });
        const j = (await r.json().catch(() => ({}))) as { output?: string; error?: string; control?: { instructions: string; tools: unknown[] } | null };
        output = j.output ?? JSON.stringify({ error: j.error ?? 'No se pudo consultar.' });
        if (c.name === 'mw_control_activate' && j.control) {
          extra.current = j.control;
          setControl(true);
          applySession();
        }
      }
      send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output } });
    }
    send({ type: 'response.create' });
  };

  const onEvent = (ev: { type: string; [k: string]: unknown }) => {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        setStatus('listening');
        setSaid('');
        touch();
        break;
      case 'response.created':
        setStatus('thinking');
        setSaid('');
        break;
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        setStatus('speaking');
        setSaid((s) => s + String(ev.delta ?? ''));
        break;
      case 'response.done': {
        const r = ev.response as { output?: { type: string; call_id: string; name: string; arguments: string }[]; usage?: Record<string, unknown> } | undefined;
        if (r?.usage) {
          const u = r.usage as {
            input_token_details?: { text_tokens?: number; audio_tokens?: number; cached_tokens_details?: { text_tokens?: number; audio_tokens?: number } };
            output_token_details?: { text_tokens?: number; audio_tokens?: number };
          };
          const body = {
            textIn: u.input_token_details?.text_tokens ?? 0,
            audioIn: u.input_token_details?.audio_tokens ?? 0,
            textCached: u.input_token_details?.cached_tokens_details?.text_tokens ?? 0,
            audioCached: u.input_token_details?.cached_tokens_details?.audio_tokens ?? 0,
            textOut: u.output_token_details?.text_tokens ?? 0,
            audioOut: u.output_token_details?.audio_tokens ?? 0,
          };
          authFetch(cloudAI('/api/ai/voice/usage'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, app: APP.slug }) })
            .then((x) => x.json())
            .then((j: { costUSD?: number }) => typeof j.costUSD === 'number' && setSpent((v) => v + j.costUSD!))
            .catch(() => {});
        }
        const calls = (r?.output ?? []).filter((o) => o.type === 'function_call');
        if (calls.length) runCalls(calls);
        else setStatus('listening');
        break;
      }
      case 'error': {
        const msg = (ev.error as { message?: string } | undefined)?.message ?? '';
        console.warn('realtime error', msg);
        break;
      }
    }
  };

  const start = async () => {
    setError('');
    setSaid('');
    setStatus('connecting');
    try {
      const res = await authFetch(cloudAI('/api/ai/voice/session'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: APP.slug, sections }) });
      const s = (await res.json().catch(() => ({}))) as { value?: string; instructions?: string; tools?: unknown[]; error?: string };
      if (!res.ok || !s.value) throw new Error(s.error ?? 'No se pudo iniciar la voz.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
        throw new Error('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
      });
      mic.current = stream;
      const peer = new RTCPeerConnection();
      pc.current = peer;
      if (!audio.current) audio.current = new Audio();
      audio.current.autoplay = true;
      peer.ontrack = (e) => {
        if (audio.current) audio.current.srcObject = e.streams[0];
      };
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));
      const channel = peer.createDataChannel('oai-events');
      dc.current = channel;
      channel.addEventListener('open', () => {
        base.current = { instructions: s.instructions ?? '', tools: s.tools ?? [] };
        applySession();
        setSpent(0);
        touch();
        // It speaks first: "Hola, <nombre>, ¿qué quieres hacer hoy?"
        const first = (userName ?? '').trim().split(/\s+/)[0];
        send({ type: 'response.create', response: { instructions: `Saluda en una sola frase corta y cálida, en español de Chile: "Hola${first ? `, ${first}` : ''}, ¿qué quieres hacer hoy?". Nada más.` } });
        setStatus('listening');
      });
      channel.addEventListener('message', (e) => {
        try {
          onEvent(JSON.parse(e.data));
        } catch {
          /* ignore */
        }
      });
      peer.addEventListener('connectionstatechange', () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          setError('Se cortó la conexión de voz.');
          stop();
          setStatus('error');
        }
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdp = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${s.value}`, 'Content-Type': 'application/sdp' } });
      if (!sdp.ok) throw new Error('No se pudo conectar la voz.');
      await peer.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
    } catch (err) {
      stop();
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la voz.');
      setStatus('error');
    }
  };

  const toggleMute = () => {
    const next = !muted;
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const on = status !== 'off' && status !== 'error';
  useImperativeHandle(ref, () => ({ toggle: () => (on ? stop() : start()) }));
  const label: Record<Status, string> = { off: '', connecting: 'Conectando…', listening: muted ? 'Micrófono silenciado' : 'Te escucho…', thinking: 'Pensando…', speaking: 'Hablando', error: '' };
  return (
    <div className={`pointer-events-none fixed z-40 flex flex-col gap-2 ${inDial ? 'bottom-[170px] right-6 items-end md:bottom-[92px]' : 'bottom-[96px] left-4 items-start md:bottom-6 md:left-6'}`}>
      {(on || error) && (
        <div className="pointer-events-auto w-80 rounded-2xl border border-white/10 bg-[#11151c]/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${status === 'speaking' ? 'animate-pulse bg-violet-400' : status === 'listening' && !muted ? 'animate-pulse bg-emerald-400' : status === 'error' ? 'bg-rose-400' : 'bg-zinc-500'}`} />
            <span className="text-xs font-semibold text-white">{error ? 'Asistente de voz' : label[status]}</span>
            {on && spent > 0 && <span className="text-[10px] text-zinc-500" title="Costo aproximado de esta conversación">≈ US${spent.toFixed(spent < 0.1 ? 3 : 2)}</span>}
            {control && <span className="rounded-full border border-amber-300/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Master Wolf Control</span>}
            {on && (
              <button type="button" onClick={toggleMute} className="ml-auto rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label={muted ? 'Activar micrófono' : 'Silenciar micrófono'} title={muted ? 'Activar micrófono' : 'Silenciar micrófono'}>
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
            {!on && (
              <button type="button" onClick={() => setError('')} className="ml-auto rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : said ? <p className="mt-2 line-clamp-5 text-sm text-zinc-200">{said}</p> : <p className="mt-2 text-xs text-zinc-500">Pregúntame por tus notas y datos, o dime a dónde quieres ir.</p>}
          {copied && (
            <div className="mt-2 rounded-xl border border-amber-300/30 bg-amber-400/10 p-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-amber-200">Mensaje para Claude</span>
                <button type="button" onClick={() => navigator.clipboard?.writeText(copied).catch(() => {})} className="ml-auto rounded-md bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-50 hover:bg-amber-400/30">
                  Copiar
                </button>
                <button type="button" onClick={() => setCopied(null)} className="rounded p-0.5 text-amber-200/70 hover:text-white" aria-label="Cerrar mensaje">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mf-noscroll mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] text-zinc-300">{copied}</p>
            </div>
          )}
        </div>
      )}
      {!inDial && <button
        type="button"
        onClick={on ? stop : start}
        disabled={status === 'connecting'}
        aria-label={on ? 'Apagar asistente de voz' : 'Hablar con el asistente'}
        title={on ? 'Apagar asistente de voz' : 'Hablar con el asistente (voz en tiempo real)'}
        className={`pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 ${on ? 'bg-rose-500 shadow-rose-500/30' : 'bg-gradient-to-br from-violet-500 to-sky-500 shadow-violet-500/30'}`}
      >
        {on && status !== 'connecting' && <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/30" />}
        {status === 'connecting' ? <Loader2 className="h-5 w-5 animate-spin" /> : on ? <PhoneOff className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>}
    </div>
  );
});
