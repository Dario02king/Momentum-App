/**
 * The body mesh: loads the GLB, resolves the muscle contract, raycasts taps.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Raycaster, Vector2 } from 'three';
import { useThree } from '@react-three/fiber';
import { useGLTF } from './useGLTF';
import type { MuscleGroup } from '../../core/model';
import { resolveMuscleMeshes, type MuscleMeshes } from './muscleMeshMap';
import { useMuscleHighlight, type MuscleVisual } from './useMuscleHighlight';

export const BODY_MODEL_URL = '/models/momentum-body.glb';

export type BodyModelProps = {
  /** Defaults to BODY_MODEL_URL. Override for a versioned or injected asset. */
  modelUrl?: string;
  visuals?: Partial<Record<MuscleGroup, MuscleVisual>>;
  selected?: MuscleGroup | null;
  tinted?: boolean;
  onReady?: (meshes: MuscleMeshes) => void;
  onError?: (error: Error) => void;
  /** Registers the tap handler with the parent so CameraRig can drive it. */
  registerPick?: (pick: (ndc: { x: number; y: number }) => MuscleGroup | null) => void;
};

export function BodyModel({
  modelUrl = BODY_MODEL_URL,
  visuals,
  selected,
  tinted,
  onReady,
  onError,
  registerPick,
}: BodyModelProps) {
  const { camera, invalidate, gl, scene } = useThree();
  const root = useRef<Group>(null);
  const [meshes, setMeshes] = useState<MuscleMeshes | null>(null);
  const gltf = useGLTF(modelUrl);
  const raycaster = useMemo(() => new Raycaster(), []);

  useEffect(() => {
    if (!gltf) return;
    let cancelled = false;
    try {
      const resolved = resolveMuscleMeshes(gltf.scene);
      // Compile before the model enters the scene: without this the first
      // frame stalls on shader compilation, which is very visible on iOS.
      gl.compileAsync(gltf.scene, camera, scene).then(() => {
        if (cancelled) return;
        setMeshes(resolved);
        onReady?.(resolved);
        invalidate();
      });
    } catch (e) {
      onError?.(e as Error);
    }
    return () => {
      cancelled = true;
    };
  }, [gltf, gl, camera, scene, onReady, onError, invalidate]);

  useMuscleHighlight({ meshes, visuals, selected, tinted, invalidate });

  const pick = useCallback(
    (ndc: { x: number; y: number }): MuscleGroup | null => {
      if (!root.current || !meshes) return null;
      raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
      // Sorted near → far, so the first hit carrying a muscle is the visible
      // one. This is what stops a tap on the quad selecting the hamstring
      // behind it.
      const hits = raycaster.intersectObject(root.current, true);
      for (const hit of hits) {
        const id = hit.object.userData.muscle as MuscleGroup | null | undefined;
        if (id) return id;
      }
      return null;
    },
    [camera, meshes, raycaster],
  );

  useEffect(() => {
    registerPick?.(pick);
  }, [pick, registerPick]);

  if (!gltf) return null;
  return (
    <group ref={root}>
      <primitive object={gltf.scene} />
    </group>
  );
}
