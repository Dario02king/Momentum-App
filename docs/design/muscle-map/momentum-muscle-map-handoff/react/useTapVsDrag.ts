/**
 * Tap-vs-drag discrimination for a rotatable 3D body.
 *
 * The whole problem: one finger both rotates the body and selects a muscle. A
 * naive `onClick` fires at the end of every rotation, so the body would select
 * something each time the user spins it.
 *
 * Rules for a gesture to count as a tap:
 *   - ACCUMULATED travel within the slop (a small circular fidget ends where it
 *     began; start-to-end distance would wrongly call that a tap)
 *   - within the time limit (a long press is not a tap)
 *   - exactly one pointer down for the whole gesture — a second finger cancels
 *     immediately, so pinch-zoom never selects
 *
 * The candidate is cancelled the moment a threshold is passed, so by pointerup
 * there is nothing left to decide.
 */

export type PointerKind = 'mouse' | 'touch' | 'pen';

/** Thumbs on a 6.7" screen are noisier than a mouse, so touch gets more slop. */
const SLOP_PX: Record<PointerKind, number> = { touch: 10, pen: 6, mouse: 4 };
const MAX_MS: Record<PointerKind, number> = { touch: 500, pen: 500, mouse: 400 };

type Gesture = {
  pointerId: number;
  kind: PointerKind;
  startedAt: number;
  lastX: number;
  lastY: number;
  travel: number;
  isTap: boolean;
};

export class TapVsDrag {
  private gesture: Gesture | null = null;
  /** Set when a second pointer joins; blocks the tap even after it lifts. */
  private multiTouch = false;

  down(e: { pointerId: number; pointerType: string; clientX: number; clientY: number }): void {
    if (this.gesture) {
      // A second finger: this is a pinch, not a tap. Kill the candidate.
      this.gesture.isTap = false;
      this.multiTouch = true;
      return;
    }
    const kind: PointerKind =
      e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch';
    this.multiTouch = false;
    this.gesture = {
      pointerId: e.pointerId,
      kind,
      startedAt: performance.now(),
      lastX: e.clientX,
      lastY: e.clientY,
      travel: 0,
      isTap: true,
    };
  }

  /** Returns the horizontal/vertical delta to apply to the camera, if dragging. */
  move(e: { pointerId: number; clientX: number; clientY: number }): { dx: number; dy: number } | null {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return null;
    const dx = e.clientX - g.lastX;
    const dy = e.clientY - g.lastY;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    g.travel += Math.abs(dx) + Math.abs(dy);
    if (g.travel > SLOP_PX[g.kind]) g.isTap = false;
    return { dx, dy };
  }

  /** True when the finished gesture should be treated as a selection tap. */
  up(e: { pointerId: number }): boolean {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return false;
    this.gesture = null;
    if (this.multiTouch) return false;
    return g.isTap && performance.now() - g.startedAt <= MAX_MS[g.kind];
  }

  cancel(): void {
    this.gesture = null;
    this.multiTouch = false;
  }

  get isDown(): boolean {
    return this.gesture !== null;
  }
}
