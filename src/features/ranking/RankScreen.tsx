import { useCallback, useEffect, useState } from 'react';
import { RATING } from '../../core/config/constants';
import { nextRank, progressWithinRank, pointsToNextRank, rankById } from '../../core/ranks';
import { Card, EmptyState, Section } from '../../components';
import { RankIcon } from '../../components/Icons';
import { formatDayAndMonth, formatNumber } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { settingsRepository } from '../../storage/repositories';
import { loadProgression, type Progression } from '../../storage/services/ratingService';
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
  const [progression, setProgression] = useState<Progression | null>(null);
  const [reveal, setReveal] = useState(false);

  const load = useCallback(async () => {
    const next = await loadProgression();
    const settings = await settingsRepository.getOrCreate();
    const seen = settings.acknowledgedRankId ?? null;
    const seenIndex = seen ? rankById(seen).index : -1;

    // One orchestrated moment: play the reveal only when the rank is higher
    // than the one already seen, then record that it has been seen.
    if (next.rank.index > seenIndex) {
      setReveal(true);
      await settingsRepository.acknowledgeRank(next.rank.id);
      window.setTimeout(() => setReveal(false), 1000);
    }
    setProgression(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!progression) return <div className="screen" aria-busy="true" />;

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
                    <span
                      className={`rank-change__mark rank-change__mark--${change.kind}`}
                      aria-hidden="true"
                    >
                      {change.kind === 'promotion' ? '↑' : '↓'}
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
