'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCcw } from 'lucide-react';
import { cloneBody, colorFor, coverFor, lights, makeRenderer, paint, paintColors, shapeBody, type BodyRatios } from '@/components/organiza/body3d';
import { BodyMap } from '@/components/organiza/BodyMap';
import { muscleLabel, type MuscleId } from '@/components/organiza/workoutData';

/**
 * 🧍 Mono 3D de Workout Pro (Emanuel, 2026-11-17): se gira con el dedo o el mouse, zoom con pellizco o rueda,
 * y se ve SIEMPRE (aunque no hayas entrenado en un mes). Cada músculo se pinta por los entrenos TERMINADOS de
 * los últimos 7 días: 2 o más = rojo intenso · 1 = rojo suave · 0 = color piel. Tocar un músculo lo elige.
 * Si el teléfono no tiene 3D (WebGL), queda la figura plana de antes.
 */

export type View3D = 'frente' | 'lado' | 'espalda';
const ANGLE: Record<View3D, number> = { frente: 0, lado: Math.PI / 2, espalda: Math.PI };

/**
 * MOD 09: `colors` (hex por músculo) reemplaza el rojo por conteo; `ratios` le da tus proporciones; `view` gira la
 * cámara a frente / lado / espalda; `hoverText` y `legend` cambian lo que se explica al lado.
 */
type Props = {
  counts: Record<string, number>;
  picked?: MuscleId | null;
  onPick?: (m: MuscleId) => void;
  colors?: Record<string, string | null>;
  ratios?: BodyRatios | null;
  view?: View3D;
  hoverText?: (m: MuscleId) => string;
  legend?: React.ReactNode;
  height?: number;
};

export const BodyMap3D: React.FC<Props> = ({ counts, picked, onPick, colors, ratios, view = 'frente', hoverText, legend, height = 440 }) => {
  const box = useRef<HTMLDivElement>(null);
  const live = useRef<{ body: THREE.Group; reset: () => void; render: () => void; turn: (a: number) => void } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [state, setState] = useState<'loading' | 'ok' | 'flat'>('loading');
  const [hover, setHover] = useState<MuscleId | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let dead = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = makeRenderer();
    } catch {
      setState('flat');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-label', 'Cuerpo en 3D: arrastra para girar, pellizca o usa la rueda para acercar');
    el.appendChild(canvas);
    const scene = new THREE.Scene();
    lights(scene);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    const controls = new OrbitControls(cam, canvas);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 1.1;
    controls.maxDistance = 7;
    controls.rotateSpeed = 0.8;
    // Girar la cámara alrededor del cuerpo (0 = de frente; π/2 = de lado; π = de espalda). Frente con un leve ángulo.
    const turn = (a: number) => {
      const d = 3.97;
      const off = a === 0 ? 0.19 : 0;
      cam.position.set(Math.sin(a + off) * d, 0.2, Math.cos(a + off) * d);
      controls.target.set(0, 0, 0);
      controls.update();
      need = true;
    };
    const home = () => turn(ANGLE[viewRef.current]);

    let raf = 0;
    let need = true;
    home();
    const render = () => { need = true; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (controls.update() || need) {
        need = false;
        renderer.render(scene, cam);
      }
    };
    const size = () => {
      const w = el.clientWidth || 300;
      const h = el.clientHeight || 420;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(size);
    ro.observe(el);
    controls.addEventListener('change', render);

    // Tocar (sin arrastrar) un músculo lo elige; pasar el mouse muestra su nombre.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = (e: PointerEvent): MuscleId | null => {
      const b = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const body = live.current?.body;
      if (!body) return null;
      for (const h of ray.intersectObject(body, true)) {
        const id = h.object.userData?.muscle as MuscleId | null;
        if (id) return id;
        if (h.object.userData?.zone !== 'context_skin') return null; // algo neutro delante: no elige lo de atrás
      }
      return null;
    };
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
        const id = hit(e);
        if (id) pickRef.current?.(id);
      }
      down = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const id = hit(e);
      setHover(id);
      canvas.style.cursor = id ? 'pointer' : 'grab';
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', () => setHover(null));

    cloneBody()
      .then((body) => {
        if (dead) return;
        scene.add(body);
        live.current = { body, reset: home, render, turn };
        setState('ok');
        size();
        loop();
      })
      .catch(() => !dead && setState('flat'));

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      canvas.remove();
      live.current = null;
    };
  }, []);

  useEffect(() => {
    const l = live.current;
    if (!l) return;
    if (colors) paintColors(l.body, colors, picked);
    else paint(l.body, counts, picked);
    l.render();
  }, [counts, colors, picked, state]);

  const rKey = ratios ? Object.values(ratios).join(',') : '';
  useEffect(() => {
    const l = live.current;
    if (!l || !ratios) return;
    shapeBody(l.body, ratios);
    l.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rKey, state]);

  useEffect(() => {
    live.current?.turn(ANGLE[view]);
  }, [view, state]);

  if (state === 'flat') return <BodyMap body={null} counts={counts} onPick={onPick} />;
  return (
    <div className="min-w-0">
      <div className="relative">
        <div ref={box} style={{ height }} className="w-full overflow-hidden cursor-grab select-none active:cursor-grabbing" />
        {state === 'loading' && <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">Cargando tu cuerpo en 3D…</p>}
        {hover && <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-[#fff]">{hoverText ? hoverText(hover) : `${muscleLabel(hover)} · ${counts[hover] ?? 0} en 7 días`}</span>}
        {state === 'ok' && (
          <button type="button" data-help="Volver a la vista de frente" aria-label="Volver a la vista de frente" onClick={() => live.current?.reset()} className="absolute right-2 top-2 rounded-lg bg-black/45 p-1.5 text-[#fff] backdrop-blur hover:bg-black/60">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-400">
        {legend ?? (
          <>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full" style={{ background: `#${colorFor(2).getHexString()}` }} /> 2 o más</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full" style={{ background: `#${colorFor(1).getHexString()}` }} /> 1 vez</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full" style={{ background: `#${colorFor(0).getHexString()}` }} /> sin entrenar</span>
          </>
        )}
        <span className="w-full text-center text-zinc-500">Arrastra para girar · pellizca o rueda para acercar · toca un músculo</span>
        <span className="w-full text-center text-[10px] text-zinc-600">
          Modelo: <a href="https://github.com/Z-Anatomy/Models-of-human-anatomy" target="_blank" rel="noreferrer" className="underline">Z-Anatomy</a> · BodyParts3D (DBCLS) ·{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" className="underline">CC BY-SA 4.0</a>
        </span>
      </div>
    </div>
  );
};

/** 🖼️ Portada de una rutina: el mono con los músculos del día en rojo (se saca una vez y queda en memoria). */
export const MuscleCover: React.FC<{ muscles: MuscleId[]; className?: string; fallback?: React.ReactNode }> = ({ muscles, className, fallback }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  const key = [...new Set(muscles)].sort().join(',');
  useEffect(() => {
    let on = true;
    setSrc(null);
    coverFor(key ? (key.split(',') as MuscleId[]) : [])
      .then((s) => on && setSrc(s))
      .catch(() => on && setFail(true));
    return () => { on = false; };
  }, [key]);
  if (fail) return <>{fallback}</>;
  return (
    <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_center,#3a1d1d_0%,#121317_75%)] theme-fixed ${className ?? ''}`}>
      {src ? <img src={src} alt="" className="h-full w-full object-contain" draggable={false} /> : <span className="absolute inset-0 animate-pulse bg-white/[0.03]" />}
    </div>
  );
};
