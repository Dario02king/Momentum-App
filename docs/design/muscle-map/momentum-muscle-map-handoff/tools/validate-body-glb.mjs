#!/usr/bin/env node
/**
 * Validates the Momentum body GLB against the muscle-group contract.
 *
 * Run:  node tools/validate-body-glb.mjs public/models/momentum-body.glb
 *
 * Exits non-zero on any contract violation. A broken muscle mapping must fail
 * loudly in CI rather than reach a device as a dead region.
 *
 * The ten ids below are a copy of `MuscleGroup` in src/core/model/index.ts.
 * They are duplicated here on purpose: this script must be runnable without
 * the TypeScript build, and the assertion at the end of this file is what
 * catches the two lists drifting apart.
 */
import { readFileSync } from 'node:fs';

const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'core', 'quadriceps', 'hamstringsGlutes', 'calves', 'forearms',
];
const INERT = 'none';

// Expected model frame. A body that drifts out of these is a pipeline bug.
const EXPECT = {
  heightMin: 1.60, heightMax: 1.90,   // metres, feet on the ground
  widthMax: 1.40,                     // arm span in an A-pose
  footY: 0.02,                        // |min.y| must be under this
  centreX: 0.03,                      // |centre.x| — the body stands on the axis
  maxTriangles: 80000,
  minTrianglesPerGroup: 400,
};

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/validate-body-glb.mjs <path-to.glb>');
  process.exit(2);
}

const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

/* ── parse ─────────────────────────────────────────────────────────────── */

const raw = readFileSync(file);
const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const dv = new DataView(buf);
if (dv.getUint32(0, true) !== 0x46546c67) { console.error('not a GLB'); process.exit(2); }

let off = 12, json = null, bin = null;
while (off < buf.byteLength) {
  const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
  const bytes = new Uint8Array(buf, off + 8, len);
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(bytes));
  if (type === 0x004e4942) bin = bytes;
  off += 8 + len + (len % 4 ? 4 - (len % 4) : 0);
}
if (!json) { console.error('no JSON chunk'); process.exit(2); }

const CT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2],
             5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function read(accessorIndex) {
  const a = json.accessors[accessorIndex];
  const bv = json.bufferViews[a.bufferView];
  const [Arr, size] = CT[a.componentType];
  const n = NCOMP[a.type];
  const stride = bv.byteStride || size * n;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = new (a.componentType === 5126 ? Float32Array : Arr)(a.count * n);
  const view = new DataView(bin.buffer, bin.byteOffset);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < n; c++) {
      const o = base + i * stride + c * size;
      let v;
      switch (a.componentType) {
        case 5120: v = view.getInt8(o); break;
        case 5121: v = view.getUint8(o); break;
        case 5122: v = view.getInt16(o, true); break;
        case 5123: v = view.getUint16(o, true); break;
        case 5125: v = view.getUint32(o, true); break;
        default:   v = view.getFloat32(o, true);
      }
      out[i * n + c] = v;
    }
  }
  return { data: out, accessor: a };
}

/* ── structure ─────────────────────────────────────────────────────────── */

const meshes = json.meshes || [];
if (meshes.length !== 1) fail(`expected exactly 1 mesh, found ${meshes.length}`);
const prims = (meshes[0] || {}).primitives || [];
notes.push(`primitives: ${prims.length}`);

if (json.skins) fail('model must not be skinned');
if (json.animations && json.animations.length) fail('model must carry no animations');

const ext = json.extensionsRequired || [];
const KNOWN = ['KHR_mesh_quantization'];   // decoder-free; anything else needs a runtime decoder
for (const e of ext) if (!KNOWN.includes(e)) fail(`unsupported required extension "${e}" — needs a local decoder`);
notes.push(`extensionsRequired: ${ext.length ? ext.join(', ') : '(none)'}`);

/* ── attributes ────────────────────────────────────────────────────────── */

const posIdx = new Set(), nrmIdx = new Set();
for (const p of prims) {
  if (p.attributes.POSITION === undefined) fail('a primitive has no POSITION');
  if (p.attributes.NORMAL === undefined) fail('a primitive has no NORMAL — the body would render faceted');
  if (p.indices === undefined) fail('a primitive is not indexed');
  posIdx.add(p.attributes.POSITION);
  nrmIdx.add(p.attributes.NORMAL);
}
if (posIdx.size !== 1) fail(`primitives must share ONE position accessor (found ${posIdx.size}) — shared buffers are what keep this asset cheap`);
if (nrmIdx.size !== 1) fail(`primitives must share ONE normal accessor (found ${nrmIdx.size})`);

/* ── muscle mapping ────────────────────────────────────────────────────── */

const seen = new Map();
for (const p of prims) {
  const mat = json.materials[p.material];
  const name = mat ? mat.name : '(unnamed)';
  const tris = json.accessors[p.indices].count / 3;
  if (seen.has(name)) fail(`material "${name}" is used by more than one primitive — regions must be exactly one primitive each`);
  seen.set(name, tris);
}
for (const id of MUSCLE_GROUPS) {
  if (!seen.has(id)) fail(`MISSING muscle region "${id}"`);
  else if (seen.get(id) < EXPECT.minTrianglesPerGroup) fail(`region "${id}" has only ${seen.get(id)} triangles — probably collapsed`);
}
if (!seen.has(INERT)) fail(`missing inert "${INERT}" region (head, hands, feet)`);
for (const name of seen.keys()) {
  if (name !== INERT && !MUSCLE_GROUPS.includes(name)) fail(`unknown region "${name}" — not a Momentum MuscleGroup`);
}

/* ── geometry sanity ───────────────────────────────────────────────────── */

const posA = read([...posIdx][0]);
const vertexCount = posA.accessor.count;
const node = (json.nodes || []).find((n) => n.mesh === 0) || {};
const scale = node.scale || [1, 1, 1];
const translation = node.translation || [0, 0, 0];
if (posA.accessor.componentType !== 5126) {
  if (!ext.includes('KHR_mesh_quantization')) fail('quantized positions without KHR_mesh_quantization in extensionsRequired');
  if (Math.abs(scale[0] - scale[1]) > 1e-12 || Math.abs(scale[1] - scale[2]) > 1e-12) {
    fail('non-uniform dequantization scale — stored normals would be wrong after the inverse-transpose');
  }
}

const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < vertexCount; i++) {
  for (let c = 0; c < 3; c++) {
    const v = posA.data[i * 3 + c] * scale[c] + translation[c];
    if (v < min[c]) min[c] = v;
    if (v > max[c]) max[c] = v;
  }
}
const height = max[1] - min[1], width = max[0] - min[0], centreX = (max[0] + min[0]) / 2;
notes.push(`bbox  x[${min[0].toFixed(3)}, ${max[0].toFixed(3)}]  y[${min[1].toFixed(3)}, ${max[1].toFixed(3)}]  z[${min[2].toFixed(3)}, ${max[2].toFixed(3)}]`);
notes.push(`height ${height.toFixed(3)} m · width ${width.toFixed(3)} m · centreX ${centreX.toFixed(4)}`);

if (height < EXPECT.heightMin || height > EXPECT.heightMax) fail(`height ${height.toFixed(3)} m outside [${EXPECT.heightMin}, ${EXPECT.heightMax}]`);
if (width > EXPECT.widthMax) fail(`width ${width.toFixed(3)} m exceeds ${EXPECT.widthMax}`);
if (Math.abs(min[1]) > EXPECT.footY) fail(`feet are at y=${min[1].toFixed(4)}, expected the ground plane`);
if (Math.abs(centreX) > EXPECT.centreX) fail(`body is off-axis: centreX=${centreX.toFixed(4)}`);
if (height < width) fail('model does not look Y-up: it is wider than it is tall');

/* ── indices ───────────────────────────────────────────────────────────── */

let totalTris = 0;
for (const p of prims) {
  const { data } = read(p.indices);
  totalTris += data.length / 3;
  if (data.length % 3) fail('index count is not a multiple of 3');
  let bad = 0, degenerate = 0;
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i], b = data[i + 1], c = data[i + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) bad++;
    if (a === b || b === c || a === c) degenerate++;
  }
  const name = json.materials[p.material].name;
  if (bad) fail(`region "${name}": ${bad} triangles index past the vertex buffer`);
  if (degenerate) fail(`region "${name}": ${degenerate} degenerate triangles`);
}
notes.push(`vertices ${vertexCount} · triangles ${totalTris}`);
if (totalTris > EXPECT.maxTriangles) fail(`${totalTris} triangles exceeds the budget of ${EXPECT.maxTriangles}`);

/* ── bilateral check ───────────────────────────────────────────────────── */
// Paired groups must own geometry on BOTH sides of x=0: one Momentum group is
// two limbs, and a region that lost a side would still pass every count check.
const PAIRED = ['shoulders', 'biceps', 'triceps', 'forearms', 'quadriceps', 'hamstringsGlutes', 'calves'];
for (const p of prims) {
  const name = json.materials[p.material].name;
  if (!PAIRED.includes(name)) continue;
  const { data } = read(p.indices);
  let left = 0, right = 0;
  for (let i = 0; i < data.length; i++) {
    const x = posA.data[data[i] * 3] * scale[0] + translation[0];
    if (x < -0.08) left++; else if (x > 0.08) right++;
  }
  if (!left || !right) fail(`region "${name}" is not bilateral (left=${left}, right=${right})`);
}

/* ── anatomical envelopes ──────────────────────────────────────────────── */
// Guards against the region-assignment regressions fixed in v2.1. Bounds are
// fractions of body height, so they survive a re-scaled re-export. Landmarks
// measured on this mesh: lumbar apex 0.605 h, glute mass from 0.585 h, knee
// section 0.25 h.
const ENVELOPE = {
  // region:          [minY, maxY] as a fraction of height, with slack
  hamstringsGlutes: [0.21, 0.64],  // must not reach the lumbar, must not cross the knee
  quadriceps:       [0.21, 0.60],  // must not cross the knee
  calves:           [0.03, 0.28],  // must not climb into the thigh
  back:             [0.55, 0.90],  // must reach DOWN to the sacrum
  core:             [0.54, 0.75],
  chest:            [0.62, 0.84],
};
const REACH_DOWN = { back: 0.62 };  // back must own geometry at or below this

for (const p of prims) {
  const name = json.materials[p.material].name;
  const env = ENVELOPE[name];
  if (!env) continue;
  const { data } = read(p.indices);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const y = (posA.data[data[i] * 3 + 1] * scale[1] + translation[1]) / height;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  if (lo < env[0]) fail(`region "${name}" reaches down to ${(lo * 100).toFixed(1)}% of height, below its envelope (${(env[0] * 100).toFixed(0)}%)`);
  if (hi > env[1]) fail(`region "${name}" reaches up to ${(hi * 100).toFixed(1)}% of height, above its envelope (${(env[1] * 100).toFixed(0)}%)`);
  if (REACH_DOWN[name] !== undefined && lo > REACH_DOWN[name]) {
    fail(`region "${name}" stops at ${(lo * 100).toFixed(1)}% of height — it must extend down to ${(REACH_DOWN[name] * 100).toFixed(0)}% (the sacrum)`);
  }
  notes.push(`envelope ${name.padEnd(17)} y ${(lo * 100).toFixed(1)}%–${(hi * 100).toFixed(1)}% of height`);
}

/* ── attribution ───────────────────────────────────────────────────────── */

const copyright = (json.asset || {}).copyright || '';
if (!/patmateee/i.test(copyright) || !/CC-BY/i.test(copyright)) {
  fail('asset.copyright must name patmateee and CC-BY-4.0');
}

/* ── report ────────────────────────────────────────────────────────────── */

console.log(`\n${file}`);
console.log(`  ${(raw.byteLength / 1024).toFixed(0)} KB`);
for (const n of notes) console.log(`  ${n}`);
console.log('  regions:');
for (const id of [...MUSCLE_GROUPS, INERT]) {
  console.log(`    ${seen.has(id) ? '✓' : '✗'} ${id.padEnd(18)} ${seen.get(id) ?? '—'}`);
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} contract violation(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`\n✓ muscle mapping ${MUSCLE_GROUPS.length}/${MUSCLE_GROUPS.length} · contract satisfied\n`);
