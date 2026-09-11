/**
 * BodyViewer — the interactive 3D body for Momentum's Gym section.
 *
 * Owns: rendering, highlighting, camera, selection reporting.
 * Owns nothing else. Percentages, progress, history, ranking and all Gym
 * business logic stay in core/gym; this component receives derived state and
 * emits `onSelectMuscle`. See docs/body-model-contract.md §7.
 *
 * Lazy-load it — three.js must not sit in the initial bundle:
 *   const BodyViewer = lazy(() => import('../features/body/BodyViewer'));
 */
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping, PMREMGenerator, SRGBColorSpace } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { MuscleGroup } from '../../core/model';
import { BodyModel } from './BodyModel';
import { CameraRig, VIEW_AZIMUTH, type BodyView, type CameraRigHandle } from './CameraRig';
import { REGION_FACING } from './muscleMeshMap';
import type { MuscleVisual } from './useMuscleHighlight';
import './bodyViewer.css';

export type { BodyView, MuscleVisual };

export type BodyViewerProps = {
  /** Override the GLB location (versioned asset, tests, injected blob). */
  modelUrl?: string;
  /** Per-muscle colour + strength, already derived by the Gym domain. */
  visuals?: Partial<Record<MuscleGroup, MuscleVisual>>;
  selectedMuscle?: MuscleGroup | null;
  onSelectMuscle?: (muscle: MuscleGroup) => void;
  /** Data colours off = neutral premium body. Selection still highlights. */
  tinted?: boolean;
  onViewChange?: (view: BodyView) => void;
  /** Rendered instead of the canvas when WebGL is unavailable or the load fails. */
  fallback?: React.ReactNode;
  height?: number;
};

/** Cheap capability probe. Runs once; a failure here means we never mount Canvas. */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function viewFor(azimuth: number): BodyView {
  if (azimuth < 45 || azimuth > 315) return 'front';
  if (azimuth > 135 && azimuth < 225) return 'back';
  return 'side';
}

export default function BodyViewer({
  modelUrl,
  visuals,
  selectedMuscle = null,
  onSelectMuscle,
  tinted = true,
  onViewChange,
  fallback = null,
  height = 360,
}: BodyViewerProps) {
  const [supported] = useState(hasWebGL);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<BodyView>('front');
  const rig = useRef<CameraRigHandle>(null);
  const shell = useRef<HTMLDivElement>(null);
  const pick = useRef<((ndc: { x: number; y: number }) => MuscleGroup | null) | null>(null);

  const registerPick = useCallback((fn: (ndc: { x: number; y: number }) => MuscleGroup | null) => {
    pick.current = fn;
  }, []);

  const onTap = useCallback(
    (ndc: { x: number; y: number }) => {
      const hit = pick.current?.(ndc);
      // A miss does nothing. An accidental deselect is far more annoying than
      // a missed tap, so we never clear the selection from a stray tap.
      if (hit) onSelectMuscle?.(hit);
    },
    [onSelectMuscle],
  );

  const onAzimuthChange = useCallback(
    (deg: number) => {
      // Imperative, not state: the angle changes every frame while spinning and
      // must not re-render the surrounding screen. Exposed for tests and CSS.
      shell.current?.setAttribute('data-azimuth', String(deg));
      const next = viewFor(deg);
      setView((prev) => (prev === next ? prev : next));
    },
    [],
  );

  useEffect(() => {
    onViewChange?.(view);
  }, [view, onViewChange]);

  // Bring a selection made in the list into view when it faces away. Only when
  // the selected group is on the far side — otherwise the body twitches on
  // every list tap.
  useEffect(() => {
    if (!selectedMuscle || !rig.current) return;
    const want = REGION_FACING[selectedMuscle];
    const current = rig.current.azimuth();
    let d = (want - current) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    if (Math.abs(d) > 70) rig.current.faceAzimuth(want);
  }, [selectedMuscle]);

  if (!supported || failed) return <>{fallback}</>;

  return (
    <div className="body-viewer" ref={shell} data-azimuth="0" style={{ height }}>
      <Canvas
        // iPhone reports 3; capping at 2 saves ~55% of the fill rate with no
        // visible difference at this size.
        dpr={[1, 2]}
        // A static body must not burn 60fps. Every interaction invalidates.
        frameloop="demand"
        camera={{ fov: 27, near: 0.1, far: 40, position: [0, 0.92, 4.05] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = SRGBColorSpace;
          gl.toneMapping = ACESFilmicToneMapping;
          // Studio lighting with ZERO bytes over the wire: RoomEnvironment is
          // code, not an asset. No remote HDRI, no CDN — see contract §5.
          const pmrem = new PMREMGenerator(gl);
          scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          pmrem.dispose();
        }}
      >
        <hemisphereLight args={[0xffffff, 0xcdcdda, 1.35]} />
        <directionalLight position={[-1.7, 2.6, 2.4]} intensity={2.15} />
        <directionalLight position={[2.4, 0.9, 1.5]} intensity={0.75} color={0xdfe4f5} />
        <directionalLight position={[0.4, 1.9, -2.8]} intensity={1.05} />
        <CameraRig ref={rig} onTap={onTap} onAzimuthChange={onAzimuthChange} />
        <Suspense fallback={null}>
          <BodyModel
            modelUrl={modelUrl}
            visuals={visuals}
            selected={selectedMuscle}
            tinted={tinted}
            registerPick={registerPick}
            onError={() => setFailed(true)}
          />
        </Suspense>
      </Canvas>

      <div className="body-viewer__views" role="group" aria-label="Ansicht">
        {(Object.keys(VIEW_AZIMUTH) as BodyView[]).map((v) => (
          <button
            key={v}
            type="button"
            className="body-viewer__view"
            aria-pressed={view === v}
            onClick={() => {
              rig.current?.goTo(v);
              setView(v);
            }}
          >
            {v === 'front' ? 'Vorne' : v === 'side' ? 'Seite' : 'Hinten'}
          </button>
        ))}
      </div>
    </div>
  );
}
