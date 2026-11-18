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

/* ── MOD 09: pintar por color libre y dar tus proporciones ────────────────────────────── */

/** Pinta cada músculo con el color que se le pase (hex); los que no vienen quedan neutros. */
export function paintColors(root: THREE.Object3D, colors: Record<string, string | null | undefined>, picked?: MuscleId | null) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const id = m.userData?.muscle as MuscleId | null;
    if (!m.isMesh || !id) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const hex = colors[id];
    if (picked === id) {
      mat.color.copy(C.pick);
      mat.emissive.copy(C.pick);
      mat.emissiveIntensity = 0.35;
    } else if (hex) {
      mat.color.set(hex);
      mat.emissive.set(hex);
      mat.emissiveIntensity = 0.16;
    } else {
      mat.color.copy(C.idle);
      mat.emissive.set(0);
      mat.emissiveIntensity = 0;
    }
  });
}

export type BodyRatios = { chest: number; waist: number; hip: number; arm: number; leg: number };

const ARM_Z = new Set(['anterior_delt', 'lateral_delt', 'posterior_delt', 'biceps', 'brachialis', 'triceps_lateral', 'triceps_long', 'triceps_medial', 'brachioradialis', 'forearm_extensors', 'forearm_flexors', 'hand_muscles']);
const LEG_Z = new Set(['rectus_femoris', 'vastus_group', 'lateral_hamstrings', 'medial_hamstrings', 'adductors', 'gastrocnemius', 'soleus', 'tibialis_anterior', 'fibularis', 'foot_muscles']);
type Part = 'arm' | 'leg' | 'torso' | 'head';

/** Zona del cuerpo de un vértice (coordenadas del modelo: alto ≈ -0,9 a 0,9; izquierda y derecha juntas). */
function partOf(zone: string, x: number, y: number): Part {
  if (ARM_Z.has(zone)) return 'arm';
  if (LEG_Z.has(zone)) return 'leg';
  if (zone.startsWith('context_')) {
    if (y > 0.66) return 'head';
    if (Math.abs(x) > 0.215 && y > -0.2) return 'arm';
    if (y < -0.12) return 'leg';
    return 'torso';
  }
  if (zone === 'body_context' || zone.startsWith('neck_')) return 'head';
  return 'torso';
}

/** Eje de cada brazo y pierna por altura (promedio x,z de sus músculos por franjas de 0,04), calculado una vez. */
type Axis = Map<string, { x: number; z: number }>;
let axes: { arm: Axis; leg: Axis } | null = null;
const BIN = 0.04;
const binOf = (y: number) => Math.round(y / BIN);
function buildAxes(root: THREE.Object3D) {
  const acc = { arm: new Map<string, { x: number; z: number; n: number }>(), leg: new Map<string, { x: number; z: number; n: number }>() };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const zone = m.userData.zone as string;
    const part = ARM_Z.has(zone) ? 'arm' : LEG_Z.has(zone) ? 'leg' : null;
    if (!part) return;
    const p = (m.userData.orig as Float32Array | undefined) ?? (m.geometry.getAttribute('position').array as Float32Array);
    for (let i = 0; i < p.length; i += 3) {
      const key = `${p[i] < 0 ? -1 : 1}:${binOf(p[i + 1])}`;
      const a = acc[part].get(key) ?? { x: 0, z: 0, n: 0 };
      a.x += p[i]; a.z += p[i + 2]; a.n++;
      acc[part].set(key, a);
    }
  });
  const fin = (m: Map<string, { x: number; z: number; n: number }>): Axis => new Map([...m].map(([k, a]) => [k, { x: a.x / a.n, z: a.z / a.n }]));
  axes = { arm: fin(acc.arm), leg: fin(acc.leg) };
}
function axisAt(ax: Axis, side: number, y: number) {
  const b = binOf(y);
  for (let d = 0; d < 40; d++) {
    const hit = ax.get(`${side}:${b - d}`) ?? ax.get(`${side}:${b + d}`);
    if (hit) return hit;
  }
  return { x: side * 0.1, z: 0 };
}

/** Escala del torso según la altura: pecho arriba, cintura al medio, cadera abajo (con transiciones suaves). */
function torsoAt(y: number, r: BodyRatios) {
  const pts: [number, number][] = [[0.72, 1], [0.55, r.chest], [0.38, r.chest], [0.2, r.waist], [0.08, r.waist], [-0.04, r.hip], [-0.3, r.hip]];
  if (y >= pts[0][0]) return 1;
  for (let i = 1; i < pts.length; i++) {
    const [y0, v0] = pts[i - 1];
    const [y1, v1] = pts[i];
    if (y >= y1) return v1 + ((y - y1) / (y0 - y1)) * (v0 - v1);
  }
  return r.hip;
}

/**
 * Le da al mono tus proporciones (MOD 09). Deforma los vértices (no la escala de los nodos: el modelo no tiene),
 * guardando las posiciones originales para volver a aplicar con otras medidas. 1 en todo = el modelo estándar.
 * Brazos y piernas se ensanchan alrededor de su propio eje (por lado y por altura) y se corren con el torso/cadera.
 */
export function shapeBody(root: THREE.Object3D, r: BodyRatios) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.userData.orig) {
      m.geometry = m.geometry.clone(); // las copias comparten geometría: esta pasa a ser propia
      m.userData.orig = Float32Array.from(m.geometry.getAttribute('position').array as Float32Array);
    }
  });
  if (!axes) buildAxes(root);
  const ax = axes!;
  const shoulder = torsoAt(0.45, r);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const zone = m.userData.zone as string;
    const src = m.userData.orig as Float32Array;
    const attr = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2];
      const part = partOf(zone, x, y);
      if (part === 'head') { p[i] = x; p[i + 1] = y; p[i + 2] = z; continue; }
      if (part === 'torso') {
        const k = torsoAt(y, r);
        p[i] = x * k; p[i + 1] = y; p[i + 2] = z * k;
        continue;
      }
      const side = x < 0 ? -1 : 1;
      const c = axisAt(part === 'arm' ? ax.arm : ax.leg, side, y);
      let w = 1;
      if (part === 'arm') w = y > 0.43 ? 0.5 : y < 0.2 ? 0.55 : 1; // hombro y antebrazo cambian menos que el brazo
      else w = y < -0.45 ? 0.55 : 1; // pantorrilla menos que el muslo
      const k = 1 + ((part === 'arm' ? r.arm : r.leg) - 1) * w;
      // El brazo se corre hacia afuera lo que se ensanchó el torso a la altura del hombro; la pierna, lo de la cadera.
      const shift = part === 'arm' ? c.x * (shoulder - 1) : c.x * (r.hip - 1) * 0.8;
      p[i] = c.x + (x - c.x) * k + shift;
      p[i + 1] = y;
      p[i + 2] = c.z + (z - c.z) * k;
    }
    attr.needsUpdate = true;
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
  });
}
