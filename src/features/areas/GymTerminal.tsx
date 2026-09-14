import { useRef, useState } from 'react';
import { TREND_RANGES } from '../../core/config/constants';
import { today as currentDay } from '../../core/clock';
import { GymOverview } from '../gym/GymOverview';
import { MuscleEntryCard } from '../gym/MuscleEntryCard';
import { TrainingCard } from '../gym/TrainingCard';
import { TrainingPlansSection } from '../gym/TrainingPlansSection';
import { useGymHistory } from '../gym/useGymHistory';
import { useGymRating } from '../gym/useGymRating';
import { useTrainingLauncher } from '../gym/useTrainingLauncher';

/**
 * The Gym hub (WP2-2): the Gym area's front page.
 *
 * ```
 *   1  Training          where this week stands, the last session, and
 *                        the one button — Training erfassen
 *   2  Muskelgruppen     the door to the body and the ten groups
 *   3  Gym-Rating        the board Verlauf used to carry (unchanged)
 *   4  Trainingspläne    the saved plans, subordinate to the two above
 * ```
 *
 * Nothing here computes; every figure arrives from the services that always
 * produced it. The 3D body is not rendered on this page: the entry card
 * draws the bundled SVG figure, and the viewer's lazy chunk is fetched only
 * when the muscle destination opens.
 */
export function GymTerminal({ onOpenMuscles }: { onOpenMuscles(): void }) {
  const range = TREND_RANGES[TREND_RANGES.length - 1]!;
  const [reloadKey, setReloadKey] = useState(0);
  const gymRating = useGymRating();
  const gym = useGymHistory(range);
  const plansRef = useRef<HTMLDivElement>(null);

  // The area's own scroller moves, not the document: scrolling the page
  // itself lifted the whole shell and left a blank band under the tab bar.
  const scrollToPlans = () => {
    const target = plansRef.current;
    const scroller = target?.closest<HTMLElement>('.areas__scroll');
    if (!target || !scroller) return;
    const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTo({ top: scroller.scrollTop + offset - 8, behavior: 'smooth' });
  };
  const launcher = useTrainingLauncher({
    date: currentDay(),
    onClosed: () => setReloadKey((key) => key + 1),
    onManagePlans: scrollToPlans,
  });

  return (
    <>
      <TrainingCard
        rating={gymRating}
        onStart={() => launcher.start()}
        onManagePlans={scrollToPlans}
        reloadKey={reloadKey}
      />
      <MuscleEntryCard history={gym} rangeDays={range} onOpen={onOpenMuscles} />
      {gymRating ? (
        <GymOverview state={gymRating.state} started={gymRating.started} />
      ) : null}
      <div ref={plansRef}>
        <TrainingPlansSection />
      </div>
      {launcher.overlay}
    </>
  );
}
