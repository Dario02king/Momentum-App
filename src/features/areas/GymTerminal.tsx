import { useState } from 'react';
import { TREND_RANGES } from '../../core/config/constants';
import { Segmented } from '../../components';
import { useT } from '../../i18n/I18nProvider';
import { GymOverview } from '../gym/GymOverview';
import { GymProgress } from '../gym/GymProgress';
import { useGymHistory } from '../gym/useGymHistory';
import { useGymRating } from '../gym/useGymRating';

/**
 * The Gym workspace, Stage A: the rating board and the progress hierarchy
 * that Verlauf used to carry, in the order the product asks for — rating,
 * year-to-date, attendance, then muscle groups, exercises and the best set
 * per day. The 3D body, the muscle analytics and the charts arrive here in
 * Stages B and C. Nothing here computes; every figure arrives from the
 * services that always produced it.
 */
export function GymTerminal() {
  const t = useT();
  const [range, setRange] = useState<number>(TREND_RANGES[TREND_RANGES.length - 1]!);
  // The rating, the Endurance Phase and the two performance windows, loaded
  // separately from the sets so a failure in one does not empty the other.
  const gymRating = useGymRating();
  const gym = useGymHistory(range);

  return (
    <>
      {gymRating ? (
        <GymOverview state={gymRating.state} rank={gymRating.rank} started={gymRating.started} />
      ) : null}
      {gym && gym.days.length > 0 ? (
        <>
          <div className="progress__ranges">
            <Segmented<string>
              label={t('gym.progress.title')}
              value={String(range)}
              onChange={(next) => setRange(Number(next))}
              options={TREND_RANGES.map((days) => ({
                value: String(days),
                label: t('progress.rangeDays', { count: days }),
              }))}
            />
          </div>
          <GymProgress history={gym} />
        </>
      ) : null}
    </>
  );
}
