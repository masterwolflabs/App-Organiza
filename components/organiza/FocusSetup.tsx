'use client';

import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListMusic, Loader2, Music, Play, Plus, Repeat, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { canEmbed, fmtSeconds, parseYouTube, playlistIds, toSeconds } from '@/components/organiza/YouTubeList';
import { useGuardedClose } from '@/components/organiza/UnsavedGuard';
import type { Item, Module, Video } from '@/components/organiza/model';

const mid = () => Math.random().toString(36).slice(2, 9);

/** Aviso si quien subió el video no deja reproducirlo fuera de YouTube. */
const EmbedCheck: React.FC<{ video: string }> = ({ video }) => {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    canEmbed(video).then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, [video]);
  if (ok !== false) return null;
  return <p className="mt-2 rounded-lg bg-rose-500/15 px-2 py-1.5 text-xs text-rose-200 ring-1 ring-rose-400/30">⚠️ Este video no se puede reproducir fuera de YouTube (lo bloqueó quien lo subió). En el focus se va a saltar: busca otra subida de la misma canción.</p>;
};

/**
 * ⚙️ Configurar el modo focus de una acción (Emanuel, 2026-11-03): la música que suena — cada canción
 * con su link, desde, hasta (o hasta el final) y bucle — más el crossfade entre canciones y «repetir
 * toda la lista». Se guarda en el módulo «Lista de YouTube» de la acción.
 */
export const FocusSetup: React.FC<{ item: Item; onSave: (modules: Module[]) => void; onStart: () => void; onClose: () => void }> = ({ item, onSave, onStart, onClose }) => {
  const current = item.modules.find((m) => m.type === 'youtube');
  const [videos, setVideos] = useState<Video[]>(current?.videos ?? []);
  const [crossfade, setCrossfade] = useState(current?.crossfade ?? 3);
  const [loopAll, setLoopAll] = useState(current?.loopAll ?? false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  // Un link pegado sin tocar «Agregar» también se guarda.
  const pending = parseYouTube(url) && !parseYouTube(url)?.list ? [{ url: url.trim() }] : [];
  const dirty = pending.length > 0 || JSON.stringify({ videos, crossfade, loopAll }) !== JSON.stringify({ videos: current?.videos ?? [], crossfade: current?.crossfade ?? 3, loopAll: current?.loopAll ?? false });
  const save = () => {
    const music: Module = { ...(current ?? { id: mid(), type: 'youtube', title: 'Música del focus' }), videos: [...videos, ...pending], crossfade, loopAll };
    onSave(current ? item.modules.map((m) => (m.id === current.id ? music : m)) : [...item.modules, music]);
  };
  const set = (i: number, p: Partial<Video>) => setVideos((l) => l.map((v, j) => (j === i ? { ...v, ...p } : v)));
  const move = (i: number, d: number) => setVideos((l) => {
    const n = [...l];
    const [v] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, v);
    return n;
  });
  // Link de una playlist: se pregunta si van sus canciones por separado, la playlist entera o solo esa canción.
  const [askList, setAskList] = useState<{ list: string; video?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const add = () => {
    const p = parseYouTube(url);
    if (!p) return setError('Ese link no es de YouTube.');
    setError('');
    if (p.list) return setAskList({ list: p.list, video: p.video });
    setVideos((l) => [...l, { url: url.trim() }]);
    setUrl('');
  };
  const addList = async (how: 'separadas' | 'entera' | 'una') => {
    if (!askList) return;
    if (how === 'una' && askList.video) setVideos((l) => [...l, { url: `https://www.youtube.com/watch?v=${askList.video}` }]);
    if (how === 'entera') setVideos((l) => [...l, { url: `https://www.youtube.com/playlist?list=${askList.list}` }]);
    if (how === 'separadas') {
      setBusy(true);
      const ids = await playlistIds(askList.list);
      setBusy(false);
      if (!ids.length) return setError('No pude leer esa playlist (¿es privada?). Agrégala entera o canción por canción.');
      setVideos((l) => [...l, ...ids.map((id) => ({ url: `https://www.youtube.com/watch?v=${id}` }))]);
    }
    setAskList(null);
    setUrl('');
  };
  const guard = useGuardedClose(onClose);
  // Avisa al cerrar (✕, afuera o Esc) si quedó algo sin guardar.
  useEffect(() => guard.register(dirty ? save : null));
  const close = guard.close;
  const total = videos.reduce((s, v) => s + (v.to !== undefined ? v.to - (v.from ?? 0) : 0), 0);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center" onClick={close}>
        <div role="dialog" aria-label="Configurar modo focus" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-white"><Music className="h-4 w-4 text-sky-300" /> Música del focus · {item.icon} {item.title}</h2>
            <button type="button" aria-label="Cerrar" onClick={close} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <p className="mt-1 text-xs text-zinc-400">Pega tus canciones de YouTube en orden. Cada una suena desde y hasta donde digas, y se funden una con otra.</p>

          <ol className="mt-4 space-y-2">
            {videos.map((v, i) => {
              const p = parseYouTube(v.url);
              const toEnd = v.to === undefined;
              return (
                <li key={`${i}-${v.url}`} className="rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/10">
                  <div className="flex items-center gap-2.5">
                    {p?.video ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`https://i.ytimg.com/vi/${p.video}/mqdefault.jpg`} alt="" className="h-11 w-20 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-11 w-20 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-xs text-zinc-400">Playlist</span>
                    )}
                    <input defaultValue={v.url} onBlur={(e) => parseYouTube(e.target.value) && set(i, { url: e.target.value.trim() })} aria-label="Link" className="min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-xs text-zinc-300 outline-none focus:bg-white/[0.05]" />
                    <div className="flex shrink-0 flex-col">
                      <button type="button" aria-label="Subir" disabled={!i} onClick={() => move(i, -1)} className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label="Bajar" disabled={i === videos.length - 1} onClick={() => move(i, 1)} className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                    <button type="button" aria-label="Quitar" onClick={() => setVideos((l) => l.filter((_, j) => j !== i))} className="p-1 text-zinc-600 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  {p?.video && <EmbedCheck video={p.video} />}
                  {p?.video && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <label className="flex items-center gap-1">Desde <input defaultValue={fmtSeconds(v.from) || '0:00'} onBlur={(e) => set(i, { from: toSeconds(e.target.value) || undefined })} className="w-14 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-zinc-100 outline-none ring-1 ring-white/10" /></label>
                      <label className="flex items-center gap-1">Hasta <input disabled={toEnd} key={toEnd ? 'fin' : 'corte'} defaultValue={toEnd ? '' : fmtSeconds(v.to)} placeholder="fin" onBlur={(e) => set(i, { to: toSeconds(e.target.value) })} className="w-14 rounded-md bg-white/[0.06] px-1.5 py-1 text-center text-zinc-100 outline-none ring-1 ring-white/10 disabled:opacity-40" /></label>
                      <button type="button" onClick={() => set(i, { to: toEnd ? (v.from ?? 0) + 300 : undefined })} className={`rounded-full px-2 py-1 font-semibold ring-1 ${toEnd ? 'bg-sky-600/30 text-sky-100 ring-sky-400/50' : 'text-zinc-400 ring-white/15'}`}>Hasta el final</button>
                      <button type="button" onClick={() => set(i, { loop: !v.loop })} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ring-1 ${v.loop ? 'bg-violet-600/30 text-violet-100 ring-violet-400/50' : 'text-zinc-400 ring-white/15'}`}><Repeat className="h-3 w-3" /> En bucle</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Pega un link de YouTube (canción o playlist)" className="min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50" />
            <button type="submit" className="inline-flex items-center gap-1 rounded-xl bg-white/[0.08] px-3 text-sm font-semibold text-white hover:bg-white/[0.14]"><Plus className="h-4 w-4" /> Agregar</button>
          </form>
          {askList && (
            <div className="mt-2 rounded-xl bg-sky-500/10 p-3 ring-1 ring-sky-400/30">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-100"><ListMusic className="h-4 w-4" /> Ese link es de una playlist. ¿Qué agrego?</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" disabled={busy} onClick={() => addList('separadas')} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-60">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Sus canciones por separado</button>
                <button type="button" onClick={() => addList('entera')} className="rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]">La playlist entera</button>
                {askList.video && <button type="button" onClick={() => addList('una')} className="rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/[0.14]">Solo esta canción</button>}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400">Por separado puedes poner desde/hasta a cada una.</p>
            </div>
          )}
          {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}

          <div className="mt-5 space-y-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <label className="block text-sm text-zinc-200">
              <span className="flex justify-between"><b className="font-semibold">Crossfade</b><span className="tabular-nums text-zinc-400">{crossfade ? `${crossfade} s` : 'Corte seco'}</span></span>
              <input type="range" min={0} max={12} value={crossfade} onChange={(e) => setCrossfade(Number(e.target.value))} className="mt-1 w-full accent-sky-500" />
              <span className="text-xs text-zinc-500">Cuánto se funde el final de una canción con el inicio de la siguiente.</span>
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-zinc-200">
              <span><b className="block font-semibold">Repetir toda la lista</b><span className="text-xs text-zinc-500">Al terminar la última, vuelve a la primera.</span></span>
              <input type="checkbox" checked={loopAll} onChange={(e) => setLoopAll(e.target.checked)} className="h-4 w-4 accent-sky-500" />
            </label>
          </div>
          {total > 0 && <p className="mt-2 text-xs text-zinc-500">Con cortes: {fmtSeconds(total)} de música (tu acción dura {item.minutes} min).</p>}

          {guard.bar}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => { save(); onClose(); }} className="flex-1 rounded-xl bg-white/[0.08] py-2.5 text-sm font-semibold text-white hover:bg-white/[0.14]">Guardar</button>
            <button type="button" onClick={() => { save(); onStart(); }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-[#fff] hover:bg-sky-500"><Play className="h-4 w-4" /> Guardar y empezar</button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};
