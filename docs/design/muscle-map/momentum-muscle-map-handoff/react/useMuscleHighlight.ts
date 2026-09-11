/**
 * Highlight + data tint for the body's muscle regions.
 *
 * One code path serves both jobs on purpose. "Selected" and "shows Gym data"
 * are the same channel at different strengths, so they can never disagree
 * about what a region looks like.
 *
 * No postprocessing. An OutlinePass would cost a full-screen pass, a second
 * render target and MSAA on a body of eleven primitives — measure before
 * paying that. Each region gets its own material instance once and we animate
 * colour + emissive on it.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { Color, MeshStandardMaterial } from 'three';
import { useFrame } from '@react-three/fiber';
import type { MuscleGroup } from '../../core/model';
import type { MuscleMeshes } from './muscleMeshMap';

/** Matte stone grey: the neutral, premium default. */
export const BASE_COLOR = 0xc9c9d2;

export type MuscleVisual = {
  /** 0–1, already normalised by the Gym domain. Drives tint strength. */
  intensity?: number;
  /** Pre-resolved colour token from the Gym state palette. */
  tint?: string;
};

export type HighlightOptions = {
  meshes: MuscleMeshes | null;
  visuals?: Partial<Record<MuscleGroup, MuscleVisual>>;
  selected?: MuscleGroup | null;
  /** Off = neutral body, no data colours. Highlight still works. */
  tinted?: boolean;
  /** Ask the render loop for a frame; pairs with frameloop="demand". */
  invalidate: () => void;
};

type Slot = {
  material: MeshStandardMaterial;
  target: Color;
  targetEmissive: Color;
  targetEmissiveIntensity: number;
};

const SELECTED_MIX = 0.58;
const RESTING_MIX = 0.3;
const SELECTED_EMISSIVE = 0.13;
/** Below this the eye cannot tell, and continuing to lerp would never settle. */
const COLOR_EPSILON = 0.002;
/** Fallback highlight when data colours are off — nothing else marks selection. */
const NEUTRAL_HIGHLIGHT = 0x5e5ce6;

function colorDistance(a: Color, b: Color): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

export function useMuscleHighlight({
  meshes,
  visuals,
  selected,
  tinted = true,
  invalidate,
}: HighlightOptions): void {
  const slots = useRef<Map<MuscleGroup, Slot>>(new Map());
  const base = useMemo(() => new Color(BASE_COLOR), []);

  /** See CameraRig: an invalidate() inside useFrame is swallowed by that frame. */
  const pending = useRef(false);
  const keepAlive = useCallback(() => {
    if (pending.current) return;      // coalesce: one wake per frame, not one per slot
    pending.current = true;
    requestAnimationFrame(() => {
      pending.current = false;
      invalidate();
    });
  }, [invalidate]);

  // One material instance per region, created once, disposed on unmount.
  useEffect(() => {
    if (!meshes) return;
    const created = new Map<MuscleGroup, Slot>();
    for (const [id, mesh] of meshes) {
      const material = new MeshStandardMaterial({
        color: BASE_COLOR,
        roughness: 0.74,
        metalness: 0,
      });
      material.name = id;
      mesh.material = material;
      created.set(id, {
        material,
        target: new Color(BASE_COLOR),
        targetEmissive: new Color(0x000000),
        targetEmissiveIntensity: 0,
      });
    }
    slots.current = created;
    invalidate();
    return () => {
      for (const slot of created.values()) slot.material.dispose();
      slots.current = new Map();
    };
  }, [meshes, invalidate]);

  // Recompute targets when data or selection changes; the frame loop eases to them.
  useEffect(() => {
    for (const [id, slot] of slots.current) {
      const visual = visuals?.[id];
      const on = id === selected;
      if (!tinted || !visual?.tint) {
        slot.target.set(BASE_COLOR);
        if (on) {
          slot.targetEmissive.set(NEUTRAL_HIGHLIGHT);
          slot.targetEmissiveIntensity = 0.1;
        } else {
          slot.targetEmissive.set(0x000000);
          slot.targetEmissiveIntensity = 0;
        }
        continue;
      }
      // Pull the grey TOWARD the state hue rather than replacing it, so
      // shading and muscle definition survive the colour.
      const strength = (on ? SELECTED_MIX : RESTING_MIX) * (visual.intensity ?? 1);
      slot.target.copy(base).lerp(new Color(visual.tint), strength);
      slot.targetEmissive.set(visual.tint);
      slot.targetEmissiveIntensity = on ? SELECTED_EMISSIVE : 0;
    }
    invalidate();
  }, [visuals, selected, tinted, base, invalidate]);

  useFrame((_, delta) => {
    // Frame-rate independent easing, so a 120 Hz iPad and a throttled
    // background tab settle in the same wall-clock time.
    const k = 1 - Math.exp(-delta * 12);
    let moving = false;
    for (const slot of slots.current.values()) {
      const m = slot.material;
      // Snap when close. Comparing lerped colours for exact equality can never
      // settle, which would pin the render loop on forever.
      if (colorDistance(m.color, slot.target) > COLOR_EPSILON) {
        m.color.lerp(slot.target, k);
        moving = true;
      } else if (!m.color.equals(slot.target)) {
        m.color.copy(slot.target);
      }
      if (colorDistance(m.emissive, slot.targetEmissive) > COLOR_EPSILON) {
        m.emissive.lerp(slot.targetEmissive, k);
        moving = true;
      } else if (!m.emissive.equals(slot.targetEmissive)) {
        m.emissive.copy(slot.targetEmissive);
      }
      const de = slot.targetEmissiveIntensity - m.emissiveIntensity;
      if (Math.abs(de) > 0.002) {
        m.emissiveIntensity += de * k;
        moving = true;
      } else if (de !== 0) {
        m.emissiveIntensity = slot.targetEmissiveIntensity;
      }
    }
    if (moving) keepAlive();
  });
}
