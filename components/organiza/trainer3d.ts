'use client';

import * as THREE from 'three';
import type { Pose, Segment, Template } from '@/components/organiza/trainerData';

/**
 * 🎓 Maniquí del entrenador visual (MOD 10). Figuras simples (cápsulas) en jerarquía de articulaciones: se posa con
 * los ángulos de `trainerData.ts`. El cuerpo se apoya donde corresponde (pies en el suelo, manos en la barra o
 * cadera en el banco) y, en flexiones, los brazos se resuelven con cinemática inversa para que las manos no se
 * muevan del suelo. Sin modelos ni animaciones de terceros.
 */

const D = { thigh: 0.44, shin: 0.43, ankle: 0.08, spine: 0.5, shoulderW: 0.19, hipW: 0.095, upper: 0.29, fore: 0.26, hand: 0.08 };
const rad = THREE.MathUtils.degToRad;
const SKIN = new THREE.Color('#c9ced6');
const JOINT = new THREE.Color('#9aa3af');
export const TENSION = new THREE.Color('#ef4444');

export type Mannequin = {
  root: THREE.Group;
  spine: THREE.Group;
  sh: [THREE.Group, THREE.Group];
  el: [THREE.Group, THREE.Group];
  hand: [THREE.Object3D, THREE.Object3D];
  hip: [THREE.Group, THREE.Group];
  knee: [THREE.Group, THREE.Group];
  foot: [THREE.Group, THREE.Group];
  ankle: [THREE.Object3D, THREE.Object3D];
  shoulderMid: THREE.Object3D;
  segs: Record<Segment, THREE.Mesh[]>;
};

const mat = (c: THREE.Color) => new THREE.MeshStandardMaterial({ color: c.clone(), roughness: 0.55, metalness: 0.05 });
function capsule(r: number, len: number, seg: Segment | null, segs: Mannequin['segs'], down = true) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 14), mat(SKIN));
  m.position.y = down ? -len / 2 : len / 2;
  if (seg) segs[seg].push(m);
  return m;
}
const ball = (r: number) => new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat(JOINT));

export function buildMannequin(): Mannequin {
  const segs: Mannequin['segs'] = { torso: [], brazos: [], antebrazos: [], gluteos: [], muslos: [], piernas: [] };
  const root = new THREE.Group();
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.1, 6, 14), mat(SKIN));
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1, 0.85);
  segs.gluteos.push(pelvis);
  root.add(pelvis);

  const spine = new THREE.Group();
  root.add(spine);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.26, 6, 16), mat(SKIN));
  torso.position.y = 0.27;
  torso.scale.set(1.15, 1, 0.75);
  segs.torso.push(torso);
  spine.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), mat(SKIN));
  head.position.set(0, D.spine + 0.15, 0.01);
  head.scale.set(0.9, 1.08, 1);
  const neck = capsule(0.045, 0.12, null, segs, false);
  neck.position.y = D.spine + 0.02;
  // Nariz: para saber hacia dónde mira.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 8), mat(JOINT));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, D.spine + 0.14, 0.105);
  spine.add(neck, head, nose);
  const shoulderMid = new THREE.Object3D();
  shoulderMid.position.y = D.spine - 0.04;
  spine.add(shoulderMid);

  const arm = (side: 1 | -1) => {
    const sh = new THREE.Group();
    sh.position.set(side * D.shoulderW, D.spine - 0.04, 0);
    sh.rotation.order = 'XYZ';
    sh.add(ball(0.055), capsule(0.05, D.upper, 'brazos', segs));
    const el = new THREE.Group();
    el.position.y = -D.upper;
    el.add(ball(0.042), capsule(0.042, D.fore, 'antebrazos', segs));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), mat(SKIN));
    hand.position.y = -D.fore - 0.03;
    hand.scale.set(0.8, 1.1, 0.6);
    const grip = new THREE.Object3D();
    grip.position.y = -D.fore - 0.04;
    el.add(hand, grip);
    sh.add(el);
    spine.add(sh);
    return { sh, el, grip };
  };
  const leg = (side: 1 | -1) => {
    const hip = new THREE.Group();
    hip.position.set(side * D.hipW, -0.03, 0);
    hip.rotation.order = 'XYZ';
    hip.add(ball(0.07), capsule(0.072, D.thigh, 'muslos', segs));
    const knee = new THREE.Group();
    knee.position.y = -D.thigh;
    knee.add(ball(0.056), capsule(0.058, D.shin, 'piernas', segs));
    const foot = new THREE.Group();
    foot.position.y = -D.shin;
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.24), mat(SKIN));
    sole.position.set(0, -D.ankle + 0.03, 0.06);
    // Punto de apoyo: la planta, bajo la base de los dedos (de pie toca el suelo; en flexiones, la punta).
    const ankle = new THREE.Object3D();
    ankle.position.set(0, -D.ankle, 0.15);
    foot.add(ball(0.045), sole, ankle);
    knee.add(foot);
    hip.add(knee);
    root.add(hip);
    return { hip, knee, foot, ankle };
  };
  const L = arm(1), R = arm(-1), LL = leg(1), RL = leg(-1);
  return { root, spine, sh: [L.sh, R.sh], el: [L.el, R.el], hand: [L.grip, R.grip], hip: [LL.hip, RL.hip], knee: [LL.knee, RL.knee], foot: [LL.foot, RL.foot], ankle: [LL.ankle, RL.ankle], shoulderMid, segs };
}

/** Ángulos → rotaciones (ver convenciones en trainerData). Deja la raíz en el origen; `place` la ubica después. */
function setAngles(m: Mannequin, p: Pose) {
  m.root.position.set(0, 0, 0);
  m.root.rotation.set(rad(p.pitch), 0, 0);
  m.spine.rotation.set(rad(p.spine), 0, 0);
  const side = [1, -1] as const;
  ([['shL', 'abdL', 'elL'], ['shR', 'abdR', 'elR']] as const).forEach(([s, a, e], i) => {
    m.sh[i].quaternion.identity();
    m.sh[i].rotation.set(-rad(p[s]), 0, side[i] * rad(p[a]));
    m.el[i].rotation.set(-rad(p[e]), 0, 0);
  });
  ([['hipL', 'kneeL', 'ankleL'], ['hipR', 'kneeR', 'ankleR']] as const).forEach(([h, k, an], i) => {
    m.hip[i].rotation.set(-rad(p[h]), 0, side[i] * rad(p.stance));
    m.knee[i].rotation.set(rad(p[k]), 0, 0);
    const a = p[an];
    // Pie plano en el suelo si no se indica el tobillo: compensa toda la cadena.
    m.foot[i].rotation.set(a === null ? -(rad(p.pitch) - rad(p[h]) + rad(p[k])) : rad(a), 0, 0);
  });
  m.root.updateMatrixWorld(true);
}

const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);

/** Apunta un hueso (que cuelga hacia −Y) en una dirección del mundo. */
function aim(bone: THREE.Object3D, dir: THREE.Vector3) {
  const pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
  const local = dir.clone().normalize().applyQuaternion(pq.invert());
  bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), local);
  bone.updateMatrixWorld(true);
}
/** Cinemática inversa de 2 huesos: hombro → codo → mano a `target`, con el codo hacia `pole`. */
function solveArm(sh: THREE.Group, el: THREE.Group, target: THREE.Vector3, pole: THREE.Vector3) {
  const a = D.upper, b = D.fore + 0.04;
  const A = world(sh);
  const toT = target.clone().sub(A);
  const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), a + b - 1e-4);
  const dirT = toT.normalize();
  const n = new THREE.Vector3().crossVectors(dirT, pole.clone().sub(A)).normalize();
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
  const angA = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const upper = dirT.clone().applyAxisAngle(n, -angA);
  // Elegir el lado del polo.
  const alt = dirT.clone().applyAxisAngle(n, angA);
  const P = pole.clone().sub(A);
  const up = upper.dot(P) >= alt.dot(P) ? upper : alt;
  aim(sh, up);
  el.quaternion.identity();
  el.updateMatrixWorld(true);
  const M = world(el);
  aim(el, target.clone().sub(M));
}

/* ── Escena del ejercicio ─────────────────────────────────────────────────────────── */

export type Rig = {
  m: Mannequin;
  group: THREE.Group;
  pose: (p: Pose) => void;
  trail: THREE.Line;
  center: THREE.Vector3;
  height: number;
  setTension: (on: number) => void;
};

const FLOOR_ANKLE = 0;
const steel = () => new THREE.MeshStandardMaterial({ color: '#8b95a3', roughness: 0.35, metalness: 0.8 });
const plateMat = () => new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.6, metalness: 0.2 });
const benchMat = () => new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.8 });

function barbell(len = 1.5) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 10), steel());
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [1, -1]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), plateMat());
    plate.rotation.z = Math.PI / 2;
    plate.position.x = s * (len / 2 - 0.12);
    g.add(plate);
  }
  return g;
}
function dumbbell() {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), steel());
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 16), plateMat());
    w.rotation.z = Math.PI / 2;
    w.position.x = s * 0.12;
    g.add(w);
  }
  return g;
}

/** Arma el maniquí para una plantilla: dónde se apoya, implementos, recorrido. */
export function buildRig(t: Template): Rig {
  const m = buildMannequin();
  const group = new THREE.Group();
  group.add(m.root);

  // Dónde va el ancla (calculado con la pose de inicio).
  setAngles(m, t.start);
  const ankleL0 = world(m.ankle[0]);
  const footTarget = new THREE.Vector3(ankleL0.x, FLOOR_ANKLE, 0);
  const lying = t.anchor === 'cadera';
  const hipTarget = new THREE.Vector3(0, 0.56, 0);
  const placeStart = () => {
    if (lying) m.root.position.copy(hipTarget);
    else m.root.position.copy(footTarget.clone().sub(world(m.ankle[0])));
    m.root.updateMatrixWorld(true);
  };
  placeStart();
  let handTargets = [world(m.hand[0]), world(m.hand[1])];
  if (t.handsFixed) handTargets = handTargets.map((h) => new THREE.Vector3(h.x, 0.03, h.z));
  const handMid0 = mid(handTargets[0], handTargets[1]);
  // Colgado o apoyado en las manos: los pies quedan sobre el suelo, sin tocarlo.
  if (t.anchor === 'manos') {
    handMid0.y += 0.15;
    handTargets = handTargets.map((h) => h.clone().add(new THREE.Vector3(0, 0.15, 0)));
  }
  const shoulderStart = world(m.shoulderMid);

  // Implementos
  const bar = t.props.includes('barra') ? barbell(t.id === 'curl' ? 1.1 : 1.5) : null;
  const dbs = t.props.includes('mancuernas') ? [dumbbell(), dumbbell()] : [];
  if (bar) group.add(bar);
  dbs.forEach((x) => group.add(x));
  if (t.props.includes('barra_alta')) {
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.3, 10), steel());
    hb.rotation.z = Math.PI / 2;
    hb.position.copy(handMid0);
    group.add(hb);
  }
  if (t.props.includes('paralelas')) {
    for (const h of handTargets) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 10), steel());
      rail.rotation.x = Math.PI / 2;
      rail.position.set(h.x, h.y - 0.02, h.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h.y, 8), steel());
      post.position.set(h.x, h.y / 2, h.z - 0.25);
      group.add(rail, post);
    }
  }
  if (t.props.includes('banco')) {
    const top = t.id === 'hipthrust' ? Math.max(0.3, shoulderStart.y - 0.12) : 0.44;
    const len = t.id === 'hipthrust' ? 0.5 : 1.2;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, len), benchMat());
    const cz = t.id === 'hipthrust' ? shoulderStart.z - 0.18 : -0.35;
    bench.position.set(0, top - 0.04, cz);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.22, top - 0.08, 0.08), benchMat());
    legs.position.set(0, (top - 0.08) / 2, cz);
    group.add(bench, legs);
  }

  const place = (p: Pose) => {
    setAngles(m, p);
    if (lying) m.root.position.copy(hipTarget);
    else if (t.anchor === 'manos') {
      const now = mid(world(m.hand[0]), world(m.hand[1]));
      m.root.position.copy(handMid0.clone().sub(now));
    } else m.root.position.copy(footTarget.clone().sub(world(m.ankle[0])));
    m.root.updateMatrixWorld(true);
    if (t.handsFixed) {
      for (const i of [0, 1] as const) {
        const A = world(m.sh[i]);
        // Codos hacia atrás (hacia los pies) y un poco afuera.
        const pole = A.clone().add(new THREE.Vector3(i === 0 ? 0.25 : -0.25, 0.3, -0.5));
        solveArm(m.sh[i], m.el[i], handTargets[i], pole);
      }
    }
  };
  const props = () => {
    const hl = world(m.hand[0]), hr = world(m.hand[1]);
    if (bar) {
      if (t.id === 'sentadilla' || t.id === 'hipthrust') {
        // Barra apoyada: en sentadilla sobre los hombros (adelante), en hip thrust sobre la cadera.
        bar.position.copy(t.id === 'hipthrust' ? world(m.root).add(new THREE.Vector3(0, 0.13, 0)) : mid(hl, hr));
      } else bar.position.copy(mid(hl, hr));
    }
    dbs.forEach((d, i) => d.position.copy(i === 0 ? hl : hr));
  };
  const trackPoint = () => {
    if (t.track === 'barra') return bar ? bar.position.clone() : mid(world(m.hand[0]), world(m.hand[1]));
    if (t.track === 'manos') return world(m.hand[0]);
    if (t.track === 'cadera') return world(m.root);
    return world(m.shoulderMid);
  };

  // Recorrido: una repetición muestreada.
  const pts: THREE.Vector3[] = [];
  const box = new THREE.Box3();
  for (let i = 0; i <= 30; i++) {
    const k = i / 30;
    const p = {} as Pose;
    for (const key of Object.keys(t.start) as (keyof Pose)[]) {
      const a = t.start[key], b = t.end[key];
      (p as Record<string, unknown>)[key] = a === null || b === null ? (k < 0.5 ? a : b) : (a as number) + ((b as number) - (a as number)) * k;
    }
    place(p);
    props();
    pts.push(trackPoint());
    box.expandByObject(group);
  }
  const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#38bdf8', dashSize: 0.03, gapSize: 0.02 }));
  trail.computeLineDistances();
  group.add(trail);
  box.expandByPoint(new THREE.Vector3(0, 0, 0));

  const setTension = (on: number) => {
    for (const [seg, list] of Object.entries(m.segs) as [Segment, THREE.Mesh[]][]) {
      const active = t.tension.includes(seg);
      for (const mesh of list) {
        const mt = mesh.material as THREE.MeshStandardMaterial;
        mt.color.copy(active ? SKIN.clone().lerp(TENSION, 0.55 + 0.35 * on) : SKIN);
        mt.emissive.copy(active ? TENSION : new THREE.Color(0));
        mt.emissiveIntensity = active ? 0.1 + 0.25 * on : 0;
      }
    }
  };
  setTension(0);

  return {
    m, group, trail, setTension,
    center: box.getCenter(new THREE.Vector3()),
    height: Math.max(box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z * 0.8, 1),
    pose: (p: Pose) => {
      place(p);
      props();
    },
  };
}

/** Piso: un disco suave con líneas, para que se entienda dónde se apoya. */
export function floor() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshStandardMaterial({ color: '#1e2330', roughness: 1 }));
  disc.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(2.8, 14, '#2f3646', '#262c3a');
  grid.position.y = 0.001;
  g.add(disc, grid);
  return g;
}
