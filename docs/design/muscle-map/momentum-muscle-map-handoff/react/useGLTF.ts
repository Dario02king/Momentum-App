/**
 * Minimal GLTF loading hook.
 *
 * drei's useGLTF would do this, but drei is not a dependency (see
 * docs/body-model-contract.md §6) and this is the only thing we'd want from
 * it. No Draco or KTX2 setup: the asset uses KHR_mesh_quantization, which
 * GLTFLoader decodes in core with no decoder file — that is the whole reason
 * we picked it for an offline-first PWA.
 */
import { useEffect, useState } from 'react';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

const cache = new Map<string, Promise<GLTF>>();

export function loadGLTF(url: string): Promise<GLTF> {
  let hit = cache.get(url);
  if (!hit) {
    hit = new GLTFLoader().loadAsync(url);
    // Don't cache a rejection: a failed load must be retryable when the user
    // comes back online.
    hit.catch(() => cache.delete(url));
    cache.set(url, hit);
  }
  return hit;
}

/** Frees the cached model. Call when leaving the Gym section for good. */
export function clearGLTF(url: string): void {
  cache.delete(url);
}

export function useGLTF(url: string): GLTF | null {
  const [gltf, setGltf] = useState<GLTF | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGLTF(url).then(
      (g) => {
        if (!cancelled) setGltf(g);
      },
      () => {
        /* surfaced by the caller's error boundary */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return gltf;
}
