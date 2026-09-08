import { displayedRankProgress } from '../../core/ranks/progress';
import { TRAINING_RATING } from '../../core/config/constants';
import type { Rank } from '../../core/ranks';
import { Card, Section } from '../../components';
import { RankBadge } from '../ranking/RankBadge';
import { useT } from '../../i18n/I18nProvider';
import type { GymRatingState } from '../../storage/services/gymRatingService';
import './gym.css';

/**
 * The top of Gym, in the order the product asks for.
 *
 * ```
 *   1  Gym rating          the headline
 *   2  Performance YTD     the secondary headline
 *   3  Attendance          the explanatory metric
 *   4  everything else     further down, in Progress
 * ```
 *
 * Two rules shape it beyond the ordering.
 *
 * **Attendance and performance stay separately inspectable.** They are the
 * two halves of the rating, they can disagree, and a user who trains
 * faithfully through a plateau should be able to see *which* half moved
 * rather than being handed one number and left to guess.
 *
 * **This component computes nothing.** Every figure arrives from
 * `storage/services/gymRatingService`, which arrives from `core/gym/*`. A
 * number here and a number on the Progress screen cannot disagree, because
 * there is only one place either of them could have come from.
 */

/** A percentage change, spoken. `null` becomes the "no baseline" phrase. */
function changeText(
  change: number | null,
  t: ReturnType<typeof useT>,
): string {
  if (change === null) return t('gym.performance.none');
  const rounded = Math.round(change);
  if (rounded === 0) return t('gym.change.unchanged');
  return rounded > 0
    ? t('gym.change.improved', { percent: rounded })
    : t('gym.change.declined', { percent: rounded });
}

function Meter({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      className="gym-meter"
      role="img"
      aria-label={label}
    >
      <span className="gym-meter__fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

export function GymOverview({
  state,
  rank,
  started,
}: {
  state: GymRatingState;
  rank: Rank;
  /** False until a session has actually been logged. */
  started: boolean;
}) {
  const t = useT();

  if (!started) {
    return (
      <Section label={t('gym.rating.title')}>
        <Card>
          <p className="gym-overview__empty">{t('gym.rating.notStarted')}</p>
        </Card>
      </Section>
    );
  }

  const progress = displayedRankProgress(state.rating, rank);
  const attendancePercent =
    state.weeklyTarget > 0
      ? Math.min(100, (state.sessionsThisWeek / state.weeklyTarget) * 100)
      : 0;

  return (
    <>
      {/* 1 — the rating itself. */}
      <Section label={t('gym.rating.title')}>
        <Card>
          <div className="gym-overview__hero">
            <RankBadge rankId={rank.id} size={64} mystery={!state.endurance.unlocked} />
            <div className="gym-overview__heroBody">
              <p className="gym-overview__rank">{rank.name}</p>
              <p className="gym-overview__rating">
                {t('gym.rating.value', { value: progress.value })}
              </p>
            </div>
          </div>
          <Meter
            percent={progress.percent}
            label={t('gym.rating.value', { value: progress.value })}
          />
          <p className="gym-overview__note">{t('gym.rating.explain')}</p>
          {state.maintenance ? (
            <p className="gym-overview__note gym-overview__note--strong">
              {t('gym.maintenance.body')}
            </p>
          ) : null}
        </Card>
      </Section>

      {/* The Endurance Phase, while it is still the reason the rank is held. */}
      {!state.endurance.unlocked ? (
        <Section label={t('gym.endurance.title')}>
          <Card>
            <div className="gym-overview__line">
              <span className="gym-overview__lineLabel">{t('gym.endurance.locked')}</span>
              <span className="gym-overview__lineValue">
                {t('gym.endurance.progress', {
                  progress: state.endurance.progress.toFixed(1),
                  required: state.endurance.required,
                })}
              </span>
            </div>
            <Meter
              percent={(state.endurance.progress / state.endurance.required) * 100}
              label={t('gym.endurance.progress', {
                progress: state.endurance.progress.toFixed(1),
                required: state.endurance.required,
              })}
            />
            <p className="gym-overview__note">{t('gym.endurance.explain')}</p>
            {/* Never mislabelled as performance: it is attendance over weeks. */}
            <p className="gym-overview__note">{t('gym.endurance.stillCounts')}</p>
          </Card>
        </Section>
      ) : null}

      {/* 2 — performance year to date, the visible secondary headline. */}
      <Section label={t('gym.ytd.title')}>
        <Card>
          <div className="gym-overview__line">
            <span className="gym-overview__lineValue gym-overview__lineValue--large">
              {changeText(state.ytdChange, t)}
            </span>
            <span className="gym-overview__lineLabel">
              {t('gym.progress.groupsCounted', {
                count: state.ytd?.measured.length ?? 0,
                total: 10,
              })}
            </span>
          </div>
          <p className="gym-overview__note">{t('gym.ytd.explain')}</p>
          {state.performance.score === null ? (
            <p className="gym-overview__note">{t('gym.performance.needsSecond')}</p>
          ) : null}
          {state.performance.components.length === 1 ? (
            <p className="gym-overview__note">
              {state.performance.components[0] === 'trend'
                ? t('gym.performance.onlyTrend')
                : t('gym.performance.onlyYtd')}
            </p>
          ) : null}
        </Card>
      </Section>

      {/* 3 — attendance, inspectable on its own. */}
      <Section label={t('gym.attendance.title')}>
        <Card>
          <div className="gym-overview__line">
            <span className="gym-overview__lineLabel">{t('gym.attendance.thisWeek')}</span>
            <span className="gym-overview__lineValue">
              {t('gym.attendance.value', {
                sessions: state.sessionsThisWeek,
                target: state.weeklyTarget,
              })}
            </span>
          </div>
          <Meter
            percent={attendancePercent}
            label={t('gym.attendance.value', {
              sessions: state.sessionsThisWeek,
              target: state.weeklyTarget,
            })}
          />
          <p className="gym-overview__note">{t('gym.attendance.explain')}</p>
        </Card>
      </Section>

      {/* Surfaced only while it is actually happening. */}
      {state.abstinence && state.abstinence.days >= TRAINING_RATING.ABSTINENCE_BLOCK_DAYS ? (
        <Section label={t('gym.decay.title')}>
          <Card>
            <div className="gym-overview__line">
              <span className="gym-overview__lineLabel">
                {t('gym.decay.days', { days: state.abstinence.days })}
              </span>
              <span className="gym-overview__lineValue">
                {t('gym.decay.lost', { percent: Math.round(state.decayFraction * 100) })}
              </span>
            </div>
            <p className="gym-overview__note">{t('gym.decay.explain')}</p>
            <p className="gym-overview__note">{t('gym.decay.floor')}</p>
            <p className="gym-overview__note">{t('gym.decay.resume')}</p>
          </Card>
        </Section>
      ) : null}
    </>
  );
}
