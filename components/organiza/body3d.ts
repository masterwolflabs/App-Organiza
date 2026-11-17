'use client';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MuscleId } from '@/components/organiza/workoutData';

/**
 * 🧍 El mono 3D de Workout Pro (Emanuel, 2026-11-17): cuerpo anatómico real con los músculos por zona.
 * Modelo `public/models/muscles.glb`: Z-Anatomy (Gauthier Kervyn) sobre BodyParts3D (DBCLS), adaptado por
 * gymmetry-muscle-model — CC BY-SA 4.0 (ver public/models/MUSCLES-LICENSE.md). El crédito se muestra bajo la figura.
 *
 * Se baja UNA vez y se comparte: la figura grande lo clona y las portadas de las rutinas son fotos (dataURL)
 * sacadas con un solo renderizador escondido, guardadas en memoria por combinación de músculos.
 */

export const MODEL_URL = '/models/muscles.glb';

/** Zona del modelo → músculo de Workout Pro. Lo que no está aquí (cuello, manos, pies, aductores…) queda neutro. */
export const REGION: Record<string, MuscleId> = {
  pec_major_upper: 'pecho', pec_major_lower: 'pecho',
  anterior_delt: 'hombros', lateral_delt: 'hombros', posterior_delt: 'hombros', rotator_cuff: 'hombros',
  biceps: 'biceps', brachialis: 'biceps',
  triceps_lateral: 'triceps', triceps_long: 'triceps', triceps_medial: 'triceps',
  brachioradialis: 'antebrazos', forearm_extensors: 'antebrazos', forearm_flexors: 'antebrazos',
  upper_traps: 'trapecio', mid_traps: 'trapecio', lower_traps: 'trapecio', rhomboids: 'trapecio',
  upper_lats: 'dorsales', lower_lats: 'dorsales', teres_major: 'dorsales',
  erector_spinae: 'lumbares',
  rectus_abdominis: 'abdominales', transverse_abdominis: 'abdominales',
  obliques: 'oblicuos', serratus_anterior: 'oblicuos',
  glute_max: 'gluteos', glute_med: 'gluteos',
  rectus_femoris: 'cuadriceps', vastus_group: 'cuadriceps',
  lateral_hamstrings: 'femorales', medial_hamstrings: 'femorales',
  gastrocnemius: 'pantorrillas', soleus: 'pantorrillas',
};

/** Músculos que se ven mejor de espalda (la portada gira el mono si son mayoría). */
const BACK: MuscleId[] = ['dorsales', 'trapecio', 'lumbares', 'gluteos', 'femorales', 'triceps', 'pantorrillas'];

const C = {
  idle: new THREE.Color('#d8c9c3'), // músculo sin entrenar: color piel/carne suave, se ve en tema claro y oscuro
  one: new THREE.Color('#f87171'), // 1 vez
  two: new THREE.Color('#dc2626'), // 2 o más
  pick: new THREE.Color('#fb923c'), // el que tocaste
  head: new THREE.Color('#cbbdb6'),
  bone: new THREE.Color('#ece6dc'),
  tendon: new THREE.Color('#e9dfd2'),
  skin: new THREE.Color('#d8c9c3'),
};

export const colorFor = (n: number) => (n >= 2 ? C.two : n === 1 ? C.one : C.idle);

/** Zona (nombre del nodo del modelo) a la que pertenece una malla. */
const zoneOf = (o: THREE.Object3D): string => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (REGION[p.name] || p.name.startsWith('context_') || p.name === 'body_context') return p.name;
  return '';
};

let base: Promise<THREE.Group> | null = null;

/** El modelo base, bajado una vez, centrado y con 2 unidades de alto (y de -1 a 1). */
export function loadBody(): Promise<THREE.Group> {
  if (!base)
    base = new GLTFLoader().loadAsync(MODEL_URL).then((g) => {
      const root = g.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = 2 / size.y;
      root.scale.setScalar(s);
      root.position.set(-center.x * s, -center.y * s, -center.z * s);
      const wrap = new THREE.Group();
      wrap.add(root);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const zone = zoneOf(m);
        m.userData.zone = zone;
        m.userData.muscle = REGION[zone] ?? null;
      });
      return wrap;
    });
  return base;
}

/** Una copia con materiales propios (para pintarla sin tocar las demás). */
export async function cloneBody(): Promise<THREE.Group> {
  const src = await loadBody();
  const copy = src.clone(true);
  copy.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const zone = m.userData.zone as string;
    const hasVC = !!m.geometry.getAttribute('color');
    const skin = zone === 'context_skin';
    m.material = new THREE.MeshStandardMaterial({
      color: zone === 'body_context' ? C.head : zone === 'context_bone' ? C.bone : zone === 'context_tendon' ? C.tendon : skin ? C.skin : C.idle,
      vertexColors: hasVC,
      roughness: zone.startsWith('context_') ? 0.75 : 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: skin,
      opacity: skin ? 0.55 : 1,
      depthWrite: !skin,
    });
  });
  return copy;
}

/** Pinta cada músculo por cuántas veces lo trabajaste (o resalta solo `only`, para las portadas). */
export function paint(root: THREE.Object3D, counts: Record<string, number>, picked?: MuscleId | null) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const id = m.userData?.muscle as MuscleId | null;
    if (!m.isMesh || !id) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.color.copy(picked === id ? C.pick : colorFor(counts[id] ?? 0));
    mat.emissive.copy(picked === id ? C.pick : (counts[id] ?? 0) > 0 ? colorFor(counts[id]) : new THREE.Color(0));
    mat.emissiveIntensity = picked === id ? 0.35 : (counts[id] ?? 0) > 0 ? 0.18 : 0;
  });
}

export function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight('#ffffff', '#5b4a44', 1.35));
  const key = new THREE.DirectionalLight('#ffffff', 2.1);
  key.position.set(2.5, 3, 4);
  const back = new THREE.DirectionalLight('#ffe4d6', 1.2);
  back.position.set(-3, 2, -4);
  const fill = new THREE.DirectionalLight('#ffffff', 0.6);
  fill.position.set(-3, -1, 3);
  scene.add(key, back, fill);
}

export function makeRenderer(canvas?: HTMLCanvasElement, preserve = false) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: preserve, powerPreference: 'low-power' });
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  return r;
}

/* ── Portadas: foto del mono con los músculos del día en rojo ─────────────────────────── */

let shot: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; body: THREE.Group } | null = null;
const covers = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

export function coverFor(muscles: MuscleId[], w = 480, h = 240): Promise<string> {
  const ids = [...new Set(muscles)].sort();
  const key = `${ids.join(',')}|${w}x${h}`;
  const hit = covers.get(key);
  if (hit) return hit;
  const job = queue.then(async () => {
    if (!shot) {
      const r = makeRenderer(undefined, true);
      const scene = new THREE.Scene();
      lights(scene);
      const body = await cloneBody();
      scene.add(body);
      shot = { r, scene, cam: new THREE.PerspectiveCamera(28, w / h, 0.05, 50), body };
    }
    const { r, scene, cam, body } = shot;
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const counts = Object.fromEntries(ids.map((id) => [id, 2]));
    paint(body, counts);
    // De frente o de espalda según dónde estén la mayoría de los músculos del día.
    const back = ids.filter((id) => BACK.includes(id)).length > ids.length / 2;
    body.rotation.y = back ? Math.PI : 0;
    body.updateMatrixWorld(true);
    // Encuadre: la caja de los músculos resaltados (con aire), o el cuerpo entero si no hay.
    // La espalda baja es larga (cuello a pelvis) y casi no se ve: solo encuadra si va sola.
    const frame = ids.length > 1 ? ids.filter((id) => id !== 'lumbares') : ids;
    const box = new THREE.Box3();
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.muscle && frame.includes(m.userData.muscle)) box.expandByObject(m);
    });
    if (box.isEmpty()) box.setFromObject(body);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const fitH = Math.max(s.y * 0.92, (s.x / cam.aspect) * 1.25, 0.45);
    const dist = fitH / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(c.x + dist * 0.18, c.y + dist * 0.06, c.z + dist);
    cam.lookAt(c);
    r.render(scene, cam);
    return r.domElement.toDataURL('image/png');
  });
  queue = job.catch(() => undefined);
  covers.set(key, job);
  job.catch(() => covers.delete(key));
  return job;
}
