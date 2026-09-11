import { lazy } from 'react';

/**
 * The lazy boundary for the 3D body. Everything behind it — three, the
 * React renderer, the viewer — lands in its own chunk that only a host which
 * renders `BodyViewer` ever fetches. Import from here, never from
 * `./BodyViewer` directly, or the chunk boundary is gone.
 */
export const BodyViewer = lazy(() => import('./BodyViewer'));
export type { BodyView, BodyViewerProps, MuscleVisual } from './BodyViewer';
export { BODY_REGIONS, REGION_FACING } from './muscleMeshMap';
export * from './tokens';
