/**
 * The one place that knows how GLB material names map to Momentum muscle ids.
 *
 * `MuscleGroup` comes from src/core/model/index.ts and is authoritative. The
 * model follows the domain; nothing here invents, splits or renames an id.
 *
 * Contract (enforced at build time by tools/validate-body-glb.mjs and at
 * runtime by resolveMuscleMeshes below): the GLB has exactly one mesh with one
 * primitive per region, and each primitive's material name IS the MuscleGroup
 * id, verbatim, plus one `none` primitive for head, hands and feet.
 */
import type { Object3D, Mesh } from 'three';
import type { MuscleGroup } from '../../core/model';

/** Material name used by geometry that must never be selectable or tinted. */
export const INERT_REGION = 'none';

/** Every id the model is required to carry. Order is display order. */
export const BODY_REGIONS: readonly MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'quadriceps',
  'hamstringsGlutes',
  'calves',
  'forearms',
];

/**
 * Which way the camera must face for a group to be visible.
 *
 * Centroids cannot answer this: for every paired group the left and right
 * halves cancel out to the body axis, so the answer has to be stated. Used to
 * rotate a list-driven selection into view.
 */
export const REGION_FACING: Readonly<Record<MuscleGroup, number>> = {
  chest: 0,
  core: 0,
  quadriceps: 0,
  biceps: 0,
  forearms: 0,
  shoulders: 0,
  back: 180,
  hamstringsGlutes: 180,
  triceps: 180,
  calves: 180,
};

const REGION_SET = new Set<string>(BODY_REGIONS);

export function isMuscleGroup(name: string | undefined | null): name is MuscleGroup {
  return !!name && REGION_SET.has(name);
}

export type MuscleMeshes = Map<MuscleGroup, Mesh>;

/**
 * Walks a loaded glTF scene and returns the mesh per muscle group.
 *
 * Throws when the model does not satisfy the contract. This is deliberate: a
 * silently missing region is a muscle the user can tap forever with nothing
 * happening, which is far worse to debug than a loud failure at load.
 */
export function resolveMuscleMeshes(root: Object3D): MuscleMeshes {
  const found: MuscleMeshes = new Map();
  const unknown: string[] = [];

  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const name = material?.name ?? '';
    if (name === INERT_REGION) {
      mesh.userData.muscle = null;
      return;
    }
    if (!isMuscleGroup(name)) {
      unknown.push(name || '(unnamed)');
      mesh.userData.muscle = null;
      return;
    }
    if (found.has(name)) throw new Error(`body model: region "${name}" appears more than once`);
    mesh.userData.muscle = name;
    found.set(name, mesh);
  });

  const missing = BODY_REGIONS.filter((id) => !found.has(id));
  if (missing.length) {
    throw new Error(`body model: missing muscle region(s) ${missing.join(', ')}`);
  }
  if (unknown.length) {
    throw new Error(`body model: unknown region(s) ${unknown.join(', ')} — not a MuscleGroup`);
  }
  return found;
}

/**
 * How the ten ids map into momentum-body.glb.
 *
 * There is no per-id lookup table by design: the GLB carries exactly one
 * primitive per region and the primitive's MATERIAL NAME *is* the id, so the
 * mapping cannot drift from the asset. The table below is documentation of
 * the asset as shipped — triangle counts are from the validator.
 */
export const MUSCLE_MESH_MAP: Readonly<Record<MuscleGroup, {
  /** glTF mesh index — the model has a single mesh. */
  mesh: 0;
  /** primitive index inside that mesh. */
  primitive: number;
  /** material name === the MuscleGroup id. */
  material: MuscleGroup;
  /** triangles in the shipped asset. */
  triangles: number;
  /** camera azimuth in degrees at which the region is visible. */
  facing: 0 | 180;
}>> = {
  chest:            { mesh: 0, primitive: 1,  material: 'chest',            triangles: 1450, facing: 0 },
  back:             { mesh: 0, primitive: 2,  material: 'back',             triangles: 3603, facing: 180 },
  shoulders:        { mesh: 0, primitive: 3,  material: 'shoulders',        triangles: 3624, facing: 0 },
  biceps:           { mesh: 0, primitive: 4,  material: 'biceps',           triangles: 1781, facing: 0 },
  triceps:          { mesh: 0, primitive: 5,  material: 'triceps',          triangles: 1868, facing: 180 },
  core:             { mesh: 0, primitive: 6,  material: 'core',             triangles: 2341, facing: 0 },
  quadriceps:       { mesh: 0, primitive: 7,  material: 'quadriceps',       triangles: 4554, facing: 0 },
  hamstringsGlutes: { mesh: 0, primitive: 8,  material: 'hamstringsGlutes', triangles: 5175, facing: 180 },
  calves:           { mesh: 0, primitive: 9,  material: 'calves',           triangles: 3863, facing: 180 },
  forearms:         { mesh: 0, primitive: 10, material: 'forearms',         triangles: 4785, facing: 0 },
};

/** Primitive 0 is the inert `none` region: head, hands, feet. 6956 triangles. */
export const INERT_PRIMITIVE = 0;
