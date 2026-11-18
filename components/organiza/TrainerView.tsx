'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import { lights, makeRenderer } from '@/components/organiza/body3d';
import { buildRig, floor, TENSION } from '@/components/organiza/trainer3d';
import { narration, phaseAt, poseAt, repSeconds, type Phase, type Template } from '@/components/organiza/trainerData';
import { useCoachVoice } from '@/components/organiza/coachVoice';

/**
 * 🎓 Entrenador visual 3D (MODIFICACIÓN 10, Emanuel 2026-11-18): el maniquí hace el ejercicio en bucle dentro del
 * Focus. Vistas lado / frente / 3/4 (y girar con el dedo), inicio y final, recorrido (línea celeste), respiración,
 * zonas en tensión (rojo), claves, errores frecuentes y narración con la voz del dispositivo (gratis).
 */

type View = 'lado' | 'frente' | 'tres';
const VIEWS: { id: View; label: string }[] = [
  { id: 'lado', label: 'Lado' },
  { id: 'frente', label: 'Frente' },
  { id: 'tres', label: '3/4' },
];
const AZ: Record<View, number> = { lado: Math.PI / 2, frente: 0, tres: Math.PI / 4 };
const BREATH: Record<Phase['breath'], string> = { inhala: '🌬️ Inhala', exhala: '💨 Exhala', normal: '😮‍💨 Respira normal' };

export const TrainerView: React.FC<{ t: Template; exercise: string; onClose: () => void }> = ({ t, exercise, onClose }) => {
  const box = useRef<HTMLDivElement>(null);
  const ctl = useRef<{ setView: (v: View) => void } | null>(null);
  const [view, setView] = useState<View>(t.view);
  const [playing, setPlaying] = useState(true);
  const [hold, setHold] = useState<0 | 1 | null>(null);
  const [speed, setSpeed] = useState(1);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [fail, setFail] = useState(false);
  const voice = useCoachVoice();
  const state = useRef({ playing, hold, speed });
  state.current = { playing, hold, speed };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = makeRenderer();
    } catch {
      setFail(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none' });
    canvas.setAttribute('aria-label', `Maniquí haciendo ${t.label}: arrastra para girar`);
    el.appendChild(canvas);
    const scene = new THREE.Scene();
    lights(scene);
    const rig = buildRig(t);
    const fl = floor();
    fl.position.set(rig.center.x, 0, rig.center.z);
    scene.add(fl);
    scene.add(rig.group);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    const controls = new OrbitControls(cam, canvas);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 1.2;
    controls.maxDistance = 8;
    controls.target.copy(rig.center);
    const dist = rig.height / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.35 + 0.6;
    const turn = (v: View) => {
      const a = AZ[v];
      cam.position.set(rig.center.x + Math.sin(a) * dist, rig.center.y + dist * 0.18, rig.center.z + Math.cos(a) * dist);
      controls.update();
    };
    turn(t.view);
    ctl.current = { setView: turn };
    const size = () => {
      const w = el.clientWidth || 320;
      const h = el.clientHeight || 360;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();

    let raf = 0;
    let sec = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = state.current;
      let ph: Phase;
      if (st.hold !== null) ph = { name: st.hold ? 'pausa_final' : 'pausa_inicio', label: st.hold ? 'Final' : 'Inicio', breath: 'normal', k: st.hold };
      else {
        if (st.playing) sec += dt * st.speed;
        ph = phaseAt(t, sec);
      }
      rig.pose(poseAt(t, ph.k));
      // Tensión: más intensa en la parte que cuesta (subir/empujar) y abajo.
      rig.setTension(ph.name === 'pausa_inicio' ? 0.15 : 0.35 + 0.65 * ph.k);
      controls.update();
      renderer.render(scene, cam);
      if (now - lastUi > 120) {
        lastUi = now;
        setPhase(ph);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      canvas.remove();
      ctl.current = null;
    };
  }, [t]);

  useEffect(() => () => voice.stop(), [voice.stop]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${on ? 'bg-white text-[#111] ring-white' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`;
  const tensionHex = `#${TENSION.getHexString()}`;

  return (
    <div className="theme-fixed fixed inset-0 z-[99] flex items-stretch justify-center bg-black/80 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label={`Cómo se hace: ${exercise}`} onClick={(e) => e.stopPropagation()} className="flex h-full w-full flex-col overflow-hidden bg-[#0f1116] ring-1 ring-white/10 sm:h-auto sm:max-h-[94vh] sm:max-w-3xl sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-white">🎓 {exercise}</p>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div className="relative">
              <div ref={box} className="h-[46vh] min-h-[300px] w-full cursor-grab active:cursor-grabbing md:h-[440px]" />
              {fail && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-400">Este equipo no puede mostrar 3D. Abajo están las claves del ejercicio.</p>}
              {phase && !fail && (
                <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
                  <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-[#fff]">{phase.label}</span>
                  {phase.breath !== 'normal' || hold === null ? <span className="rounded-full bg-sky-500/80 px-2.5 py-1 text-xs font-bold text-[#fff]">{BREATH[phase.breath]}</span> : null}
                </div>
              )}
              <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-zinc-300">~{String(repSeconds(t)).replace('.', ',')} s por rep</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
              <button type="button" onClick={() => { setHold(null); setPlaying((p) => !p || hold !== null); }} aria-label={playing && hold === null ? 'Pausar' : 'Reproducir'} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[#fff] hover:bg-white/15">{playing && hold === null ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
              <button type="button" onClick={() => setHold(0)} className={chip(hold === 0)}>Inicio</button>
              <button type="button" onClick={() => setHold(1)} className={chip(hold === 1)}>Final</button>
              <button type="button" onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))} className={chip(speed !== 1)}>{speed === 1 ? '1×' : '½× lento'}</button>
              <span className="mx-1 h-5 w-px bg-white/10" />
              {VIEWS.map((v) => <button key={v.id} type="button" onClick={() => { setView(v.id); ctl.current?.setView(v.id); }} className={chip(view === v.id)}>{v.label}</button>)}
            </div>
            <div className="flex flex-wrap gap-3 px-3 pb-2 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: tensionHex }} /> En tensión</span>
              <span className="flex items-center gap-1"><i className="h-0.5 w-4 border-t-2 border-dashed border-sky-400" /> Recorrido</span>
              <span>Arrastra para girar</span>
            </div>
          </div>

          <div className="space-y-3 border-t border-white/10 p-4 text-sm md:border-l md:border-t-0">
            {voice.supported && (
              <button type="button" onClick={() => (voice.speaking ? voice.stop() : (voice.settings.enabled ? voice.speak(narration(t)) : (voice.update({ enabled: true }), setTimeout(() => voice.speak(narration(t)), 50))))} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500/15 py-2 text-xs font-bold text-sky-100 ring-1 ring-sky-400/30 hover:bg-sky-500/25">
                {voice.speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {voice.speaking ? 'Detener' : 'Explícamelo en voz alta'}
              </button>
            )}
            <div><p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Inicio</p><p className="text-zinc-200">{t.startText}</p></div>
            <div><p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Final</p><p className="text-zinc-200">{t.endText}</p></div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Respiración</p>
              <p className="text-zinc-200">{t.toEnd.breath === 'normal' ? 'Respira normal, sin aguantar el aire.' : `${t.toEnd.label}: ${t.toEnd.breath === 'inhala' ? 'toma aire' : 'bota el aire'} · ${t.toStart.label}: ${t.toStart.breath === 'inhala' ? 'toma aire' : 'bota el aire'}.`}</p>
            </div>
            <div><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-400">✅ Claves</p><ul className="list-disc space-y-0.5 pl-4 text-zinc-200">{t.cues.map((c) => <li key={c}>{c}</li>)}</ul></div>
            <div><p className="text-[11px] font-bold uppercase tracking-wide text-rose-400">⚠️ Errores frecuentes</p><ul className="list-disc space-y-0.5 pl-4 text-zinc-200">{t.errors.map((c) => <li key={c}>{c}</li>)}</ul></div>
            <p className="text-[10px] leading-snug text-zinc-500">Maniquí de referencia ({t.label}): muestra la técnica general, no tus medidas ni tu variante exacta. Si algo duele, para y usa «Algo no anda bien».</p>
          </div>
        </div>
      </div>
    </div>
  );
};
