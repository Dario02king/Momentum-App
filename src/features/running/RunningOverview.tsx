import { TRAINING_RATING } from '../../core/config/constants';
import { bandRange } from '../../core/running/performance';
import type { Rank } from '../../core/ranks';
import { displayedRankProgress } from '../../core/ranks/progress';
import { Card, Section } from '../../components';
import { RankBadge } from '../ranking/RankBadge';
import { useT } from '../../i18n/I18nProvider';
import type { RunningRatingState } from '../../storage/services/runningRatingService';
import './running.css';

/**
 * The top of Running, in the same order Gym uses.
 *
 * ```
 *   1  Running rating     the headline
 *   2  Pace year to date  the secondary headline
 *   3  Attendance         the explanatory metric
 *   4  distance ranges    below, in Progress
 * ```
 *
 * The two halves of the rating stay separately inspectable, because they can
 * disagree: a runner who turns up faithfully through a plateau should be able
 * to see *which* half moved.
 *
 * **No grid mechanics reach this screen.** Band indices, the anchor and the
 * logarithm are model internals; what a user is told is that runs of a
 * similar distance are compared with each other, which is the part that
 * affects what they do. Every figure arrives already computed.
 */

const changeText = (change: number | null, t: ReturnType<typeof useT>): string => {
  if (change === null) return t('running.performance.none');
  const rounded = Math.round(change);
  if (rounded === 0) return t('gym.change.unchanged');
  return rounded > 0
    ? t('gym.change.improved', { percent: rounded })
    : t('gym.change.declined', { percent: rounded });
};

function Meter({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="running-meter" role="img" aria-label={label}>
      <span
        className="running-meter__fill"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export function RunningOverview({
  state,
  rank,
  started,
}: {
  state: RunningRatingState;
  rank: Rank;
  started: boolean;
}) {
  const t = useT();

  if (!started) {
    return (
      <Section label={t('running.rating.title')}>
        <Card>
          <p className="running-overview__empty">{t('running.rating.notStarted')}</p>
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
      {/* 1 — the rating. */}
      <Section label={t('running.rating.title')}>
        <Card>
          <div className="running-overview__hero">
            <RankBadge rankId={rank.id} size={64} mystery={!state.endurance.unlocked} />
            <div className="running-overview__heroBody">
              <p className="running-overview__rank">{rank.name}</p>
              <p className="running-overview__rating">
                {t('running.rating.value', { value: progress.value })}
              </p>
            </div>
          </div>
          <Meter
            percent={progress.percent}
            label={t('running.rating.value', { value: progress.value })}
          />
          <p className="running-overview__note">{t('running.rating.explain')}</p>
          {state.maintenance ? (
            <p className="running-overview__note running-overview__note--strong">
              {t('running.maintenance.body')}
            </p>
          ) : null}
        </Card>
      </Section>

      {/* The Endurance Phase, while it is the reason the rank is held. */}
      {!state.endurance.unlocked ? (
        <Section label={t('running.endurance.title')}>
          <Card>
            <div className="running-overview__line">
              <span className="running-overview__lineLabel">
                {t('running.endurance.locked')}
              </span>
              <span className="running-overview__lineValue">
                {t('running.endurance.progress', {
                  progress: state.endurance.progress.toFixed(1),
                  required: state.endurance.required,
                })}
              </span>
            </div>
            <Meter
              percent={(state.endurance.progress / state.endurance.required) * 100}
              label={t('running.endurance.progress', {
                progress: state.endurance.progress.toFixed(1),
                required: state.endurance.required,
              })}
            />
            <p className="running-overview__note">{t('running.endurance.explain')}</p>
            <p className="running-overview__note">{t('running.endurance.stillCounts')}</p>
          </Card>
        </Section>
      ) : null}

      {/* 2 — pace year to date. */}
      <Section label={t('running.ytd.title')}>
        <Card>
          <div className="running-overview__line">
            <span className="running-overview__lineValue running-overview__lineValue--large">
              {changeText(state.ytdChange, t)}
            </span>
            <span className="running-overview__lineLabel">
              {t('running.performance.counted', { count: state.ytd?.measured.length ?? 0 })}
            </span>
          </div>
          <p className="running-overview__note">{t('running.ytd.explain')}</p>
          <p className="running-overview__note">{t('running.performance.comparable')}</p>
          {state.performance.score === null ? (
            <p className="running-overview__note">{t('running.performance.needsSecond')}</p>
          ) : null}
          {state.attendanceOnlyRuns > 0 ? (
            <p className="running-overview__note">
              {t('running.performance.attendanceOnly', { count: state.attendanceOnlyRuns })}
            </p>
          ) : null}
        </Card>
      </Section>

      {/* 3 — attendance, inspectable on its own. */}
      <Section label={t('running.attendance.title')}>
        <Card>
          <div className="running-overview__line">
            <span className="running-overview__lineLabel">
              {t('running.attendance.thisWeek')}
            </span>
            <span className="running-overview__lineValue">
              {t('running.attendance.value', {
                sessions: state.sessionsThisWeek,
                target: state.weeklyTarget,
              })}
            </span>
          </div>
          <Meter
            percent={attendancePercent}
            label={t('running.attendance.value', {
              sessions: state.sessionsThisWeek,
              target: state.weeklyTarget,
            })}
          />
          <p className="running-overview__note">{t('running.attendance.explain')}</p>
        </Card>
      </Section>

      {/* Surfaced only while it is actually happening. */}
      {state.abstinence && state.abstinence.days >= TRAINING_RATING.ABSTINENCE_BLOCK_DAYS ? (
        <Section label={t('running.decay.title')}>
          <Card>
            <div className="running-overview__line">
              <span className="running-overview__lineLabel">
                {t('running.decay.days', { days: state.abstinence.days })}
              </span>
              <span className="running-overview__lineValue">
                {t('running.decay.lost', { percent: Math.round(state.decayFraction * 100) })}
              </span>
            </div>
            <p className="running-overview__note">{t('running.decay.explain')}</p>
            <p className="running-overview__note">{t('running.decay.floor')}</p>
            <p className="running-overview__note">{t('running.decay.resume')}</p>
          </Card>
        </Section>
      ) : null}

      {/* 4 — the distance ranges, in the user's own units. */}
      {state.ytd && state.ytd.comparisons.length > 0 ? (
        <Section label={t('running.progress.distances')}>
          <Card>
            {state.ytd.comparisons.map((entry) => {
              const range = bandRange(entry.band);
              const change =
                entry.ratio === null ? null : changeText((entry.ratio - 1) * 100, t);
              return (
                <div key={entry.band} className="running-range">
                  <span className="running-range__body">
                    <span className="running-range__label">
                      {t('running.progress.range', {
                        from: (range.from / 1000).toFixed(1),
                        to: (range.toExclusive / 1000).toFixed(1),
                      })}
                    </span>
                    <span className="running-range__meta">
                      {t('running.progress.runs', { count: entry.dates })}
                    </span>
                  </span>
                  <span className="running-range__change">
                    {change ?? t('running.progress.noBaseline')}
                  </span>
                </div>
              );
            })}
          </Card>
        </Section>
      ) : null}
    </>
  );
}
