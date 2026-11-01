'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Mic, Send, Square, Trash2 } from 'lucide-react';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface VoiceRecorderProps {
  onSend: (blob: Blob, durationSec: number) => void;
  // Renders nothing while idle (used to make room for the Send button once
  // there's text in the composer) — recording/preview still render
  // regardless, so a recording in progress is never hidden mid-flow.
  hideIdleButton?: boolean;
  // Fires whenever the recorder enters/leaves idle, so ConversationPane can
  // hide its other composer controls (attach/textarea/emoji/send) while
  // recording — this instance itself always stays mounted (never
  // conditionally rendered by the parent), so an active MediaRecorder is
  // never torn down mid-recording by a re-render.
  onActiveChange?: (active: boolean) => void;
}

// Click to start recording, click again to stop, then preview before
// sending — simpler and more reliable to automate/verify than a
// press-and-hold-to-record / slide-to-cancel gesture, and just as usable.
export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSend, hideIdleButton, onActiveChange }) => {
  const [state, setState] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onActiveChange?.(state !== 'idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRecording = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        blobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        setState('preview');
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      setState('recording');
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  };

  const discard = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setState('idle');
  };

  const send = () => {
    if (blobRef.current) onSend(blobRef.current, elapsed);
    setPreviewUrl(null);
    blobRef.current = null;
    setElapsed(0);
    setState('idle');
  };

  if (error) {
    return (
      <button
        onClick={() => setError('')}
        title={error}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-rose-400 hover:bg-rose-500/10"
      >
        <Mic className="h-4 w-4" />
      </button>
    );
  }

  if (state === 'recording') {
    return (
      <div className="flex flex-1 items-center gap-2 px-1">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-rose-500" />
        <span className="flex-1 font-mono text-xs text-zinc-300">{formatDuration(elapsed)}</span>
        <button onClick={discard} title="Cancelar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-rose-400">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={stopRecording} title="Detener" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-500">
          <Square className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (state === 'preview' && previewUrl) {
    return (
      <div className="flex flex-1 items-center gap-2 px-1">
        <audio src={previewUrl} controls className="h-8 flex-1" />
        <span className="shrink-0 font-mono text-[10px] text-zinc-500">{formatDuration(elapsed)}</span>
        <button onClick={discard} title="Descartar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-rose-400">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={send} title="Enviar audio" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-500">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (hideIdleButton) return null;

  return (
    <button
      onClick={startRecording}
      title="Grabar audio"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
    >
      <Mic className="h-4 w-4" />
    </button>
  );
};
