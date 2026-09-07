import { useCallback, useEffect, useState } from 'react';
import { RATING } from '../../core/config/constants';
import { nextRank, progressWithinRank, pointsToNextRank, rankById } from '../../core/ranks';
import { Card, EmptyState, LoadFailure, Section, StaleNotice } from '../../components';
import { RankIcon } from '../../components/Icons';
import { formatDayAndMonth, formatNumber } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { settingsRepository } from '../../storage/repositories';
import { loadProgression } from '../../storage/services/ratingService';
import { useLoadable } from '../../app/useLoadable';
import { RankBadge } from './RankBadge';
import './rank.css';

/**
 * The Rank screen.
 *
 * The screen stays light like the rest of the app; only the badge hero gets
 * its own dark surface. Current rank, peak rank and Lifetime XP are labelled
 * separately and never conflated — they answer three different questions.
 */
export function RankScreen() {
  const t = useT();
  const { language } = useI18n();

  /*
   * Rank reads the same replay as Progress, and adds one thing: whether this
   * is the first time the user is seeing this rank. That is resolved as part
   * of the load rather than in a follow-up effect, so the reveal is known on
   * the badge's very first frame — deciding it afterwards showed the badge
   * once, then restarted it from nothing.
   *
   * Recording the acknowledgement is a flourish, not the screen. If that one
   * write fails the reveal simply plays again next time; it must not turn a
   * working Rank screen into an error.
   */
  const load = useCallback(async () => {
    const progression = await loadProgression();
    const settings = await settingsRepository.getOrCreate();
    const seen = settings.acknowledgedRankId ?? null;
    const seenIndex = seen ? rankById(seen).index : -1;
    const promoted = progression.rank.index > seenIndex;

    if (promoted) {
      try {
        await settingsRepository.acknowledgeRank(progression.rank.id);
      } catch {
        /* The badge still plays; the app simply forgets that it did. */
      }
    }
    return { progression, promoted };
  }, []);

  const { state, reload } = useLoadable(load);
  const promoted = state.status === 'ready' && state.value.promoted;
  const [revealSpent, setRevealSpent] = useState(false);
  const reveal = promoted && !revealSpent;

  useEffect(() => {
    if (!reveal) return;
    const timer = window.setTimeout(() => setRevealSpent(true), 1000);
    return () => window.clearTimeout(timer);
  }, [reveal]);

  // Loading, failure and loaded stay three distinct states.
  if (state.status !== 'ready') {
    return (
      <div className="screen">
        <header className="screen__header">
          <h1 className="screen__title">{t('nav.rank')}</h1>
        </header>
        <div className="rank__scroll" aria-busy={state.status === 'loading'}>
          {state.status === 'failed' ? (
            <LoadFailure title={t('error.rank.title')} onRetry={reload} />
          ) : null}
        </div>
      </div>
    );
  }

  const progression = state.value.progression;
  const { rank, peakRank, current, lifetimeXp, checkInStreak, trainingStreak, changes } =
    progression;
  const upcoming = nextRank(rank);
  const remaining = pointsToNextRank(current);
  const calibrating = progression.points[progression.points.length - 1]?.calibrating ?? false;

  const streakLabel = (count: number, unit: 'days' | 'weeks') => {
    if (count === 0) return t('rank.noStreak');
    if (unit === 'days') return count === 1 ? t('rank.dayOne') : t('rank.days', { count });
    return count === 1 ? t('rank.weekOne') : t('rank.weeks', { count });
  };

  return (
    <div className="screen">
      <header className="screen__header">
        <h1 className="screen__title">{t('nav.rank')}</h1>
      </header>

      <div className="rank__scroll">
        {state.refreshFailed ? <StaleNotice onRetry={reload} /> : null}

        <Section>
          <div className="rank-hero">
            {reveal ? <span className="rank-hero__flash" aria-hidden="true" /> : null}
            {reveal ? <span className="rank-hero__pill">{t('rank.newRank')}</span> : null}

            <RankBadge rankId={rank.id} size={148} animate={reveal} />

            <div>
              {/* Rank names stay English in every language. */}
              <p className="rank-hero__name">{rank.name}</p>
              <p className="rank-hero__rating">{Math.round(current)} / {RATING.MAX}</p>
            </div>

            <div className="rank-hero__progress">
              <div
                className="rank-hero__track"
                role="img"
                aria-label={
                  upcoming && remaining !== null
                    ? t('rank.toNext', { points: remaining, rank: upcoming.name })
                    : t('rank.maxed')
                }
              >
                <span
                  className="rank-hero__fill"
                  style={{ width: `${Math.round(progressWithinRank(current, rank) * 100)}%` }}
                />
              </div>
              <p className="rank-hero__next">
                {upcoming && remaining !== null
                  ? t('rank.toNext', { points: remaining, rank: upcoming.name })
                  : t('rank.maxed')}
              </p>
            </div>

            {calibrating ? (
              <p className="rank-hero__note">
                {t('rank.calibrating', { days: RATING.CALIBRATION_DAYS })}
              </p>
            ) : null}
          </div>
        </Section>

        {/* The three progression concepts, kept strictly distinct. */}
        <Section>
          <Card>
            <div className="standing">
              <RankBadge rankId={rank.id} size={38} />
              <span className="standing__label">
                <span className="standing__name">{t('rank.current')}</span>
                <span className="standing__hint">{t('rank.explainCurrent')}</span>
              </span>
              <span className="standing__value">{rank.name}</span>
            </div>
            <div className="standing">
              <RankBadge rankId={peakRank.id} size={38} />
              <span className="standing__label">
                <span className="standing__name">{t('rank.peak')}</span>
                <span className="standing__hint">{t('rank.explainPeak')}</span>
              </span>
              <span className="standing__value">{peakRank.name}</span>
            </div>
            <div className="standing">
              <span className="standing__mark" aria-hidden="true">
                XP
              </span>
              <span className="standing__label">
                <span className="standing__name">{t('rank.xp')}</span>
                <span className="standing__hint">{t('rank.explainXp')}</span>
              </span>
              <span className="standing__value">{formatNumber(language, lifetimeXp)}</span>
            </div>
          </Card>
        </Section>

        <Section label={t('rank.streaks')}>
          <Card>
            <div className="streaks">
              <div className="streak">
                <p className="streak__label">{t('rank.streakCheckIn')}</p>
                <p className="streak__value">{streakLabel(checkInStreak.current, 'days')}</p>
                <p className="streak__best">
                  {t('rank.streakBest', { count: checkInStreak.best })}
                </p>
              </div>
              <div className="streak">
                <p className="streak__label">{t('rank.streakTraining')}</p>
                <p className="streak__value">{streakLabel(trainingStreak.current, 'weeks')}</p>
                <p className="streak__best">
                  {t('rank.streakBest', { count: trainingStreak.best })}
                </p>
              </div>
            </div>
          </Card>
        </Section>

        <Section label={t('rank.history')}>
          <Card>
            {changes.length === 0 ? (
              <EmptyState icon={<RankIcon size={24} />} title={t('rank.historyEmpty')} />
            ) : (
              [...changes]
                .reverse()
                .slice(0, 6)
                .map((change) => (
                  <div key={`${change.date}-${change.to}`} className="rank-change">
                    {/* The badge that was reached, with the direction kept as
                        a separate glyph — colour is never the only carrier. */}
                    <span className="rank-change__badge" aria-hidden="true">
                      <RankBadge rankId={change.to} size={32} />
                      <span
                        className={`rank-change__mark rank-change__mark--${change.kind}`}
                      >
                        {change.kind === 'promotion' ? '↑' : '↓'}
                      </span>
                    </span>
                    <span className="rank-change__body">
                      <span>{rankById(change.to).name}</span>
                      <span className="rank-change__date">
                        {t(change.kind === 'promotion' ? 'rank.promotion' : 'rank.demotion')} ·{' '}
                        {formatDayAndMonth(language, change.date)}
                      </span>
                    </span>
                  </div>
                ))
            )}
          </Card>
        </Section>
      </div>
    </div>
  );
}
