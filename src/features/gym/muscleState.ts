import type { MuscleState } from '../../components/BodyRenderer';
import type { MusclePerformance } from '../../core/gym/performance';

/**
 * The five states the body draws, from one group's performance.
 *
 * The one place the domain's three-way status and ratio become the five
 * presentation states; the SVG renderer, the 3D body and the muscle rows
 * all read this and never re-derive it.
 */
export function muscleStateOf(entry: MusclePerformance): MuscleState {
  if (entry.status === 'noData') return 'noData';
  if (entry.status === 'insufficientBaseline') return 'awaitingBaseline';
  const ratio = entry.ratio ?? 1;
  return ratio > 1 ? 'improved' : ratio < 1 ? 'declined' : 'unchanged';
}
