import { useCallback, useEffect, useState } from 'react';
import { RATING, TREND_RANGES } from '../../core/config/constants';
import { buildTrend } from '../../core/trends';
import type { BossWeights as BossWeightMap } from '../../core/boss';
import { rankById } from '../../core/ranks';
import { displayedRankProgress, rankLadder, type RankProgress } from '../../core/ranks/progress';
import type { DomainType } from '../../core/model';
import { Card, EmptyState, LoadFailure, Section, Segmented, StaleNotice } from '../../components';
import { RankIcon } from '../../components/Icons';
import { formatDayAndMonth, formatNumber } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n';
import { settingsRepository } from '../../storage/repositories';
import { loadBossProgression } from '../../storage/services/bossService';
import {
  bossWeightingOf,
  type AppConfiguration,
} from '../../storage/services/configurationService';
import { useLoadable } from '../../app/useLoadable';
import { Heatmap } from '../progress/Heatmap';
import { TrendCurve } from '../progress/TrendCurve';
import { BossWeights } from './BossWeights';
import { RankBadge } from './RankBadge';
import './rank.css';

/**
 * The Rank screen.
 *
 * The Boss is the screen's subject: one rank for everything the user does,
 * weighted the way they set it. The four domain ranks sit under it and are
 * visibly subordinate — same badge family, a third of the size, one line each.
 * There is no second emblem family and there never will be.
 *
 * Every bar and every sentence beside it comes from `rankProgress`, which is
 * the whole reason that function exists: fill and copy describing different
 * things is the defect this screen used to have.
 */

const DOMAIN_NAMES: Record<DomainType, TranslationKey> = {
  mental: 'domain.wellbeing',
  gym: 'domain.gym',
  running: 'domain.running',
  food: 'domain.food',
};

/**
 * One bar, and the sentence that describes it.
 *
 * They take the same `RankProgress`, so they cannot disagree — and the bar is
 * an image labelled with that same sentence, because a bar with no words is a
 * shape a screen reader cannot read.
 */
export function RankProgressBar({
  progress,
  className = '',
}: {
  progress: RankProgress;
  className?: string;
}) {
  const t = useT();
  const label =
    progress.next && progress.remaining !== null
      ? t('rank.boss.toNext', { points: progress.remaining, rank: progress.next.name })
      : t('rank.boss.maxed');

  return (
    <div className={`rank-progress ${className}`.trim()}>
      <div className="rank-progress__track" role="img" aria-label={label}>
        <span className="rank-progress__fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="rank-progress__caption">{label}</p>
    </div>
  );
}

export function RankScreen({
  configuration,
  onSetBossWeights,
}: {
  configuration: AppConfiguration;
  onSetBossWeights(weights: BossWeightMap): void;
}) {
  const t = useT();
  const { language } = useI18n();

  /*
   * Rank reads the same replay as Progress, and adds one thing: whether this
   * is the first time the user is seeing this rank. That is resolved as part
   * of the load rather than in a follow-up effect, so the reveal is known on
   * the badge's very first frame.
   *
   * Recording the acknowledgement is a flourish, not the screen. If that one
   * write fails the reveal simply plays again next time; it must not turn a
   * working Rank screen into an error.
   */
  const load = useCallback(async () => {
    const boss = await loadBossProgression();
    const settings = await settingsRepository.getOrCreate();
    const seen = settings.acknowledgedRankId ?? null;
    const seenIndex = seen ? rankById(seen).index : -1;
    const promoted = boss.rank.index > seenIndex;

    if (promoted) {
      try {
        await settingsRepository.acknowledgeRank(boss.rank.id);
      } catch {
        /* The badge still plays; the app simply forgets that it did. */
      }
    }
    return { boss, promoted };
  }, []);

  const { state, reload } = useLoadable(load);
  const promoted = state.status === 'ready' && state.value.promoted;
  const [revealSpent, setRevealSpent] = useState(false);
  const reveal = promoted && !revealSpent;
  // The global development block, moved here from Verlauf when Verlauf
  // became the domain terminal: the one place the combined state is shown.
  const [range, setRange] = useState<number>(TREND_RANGES[TREND_RANGES.length - 1]!);

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

  const boss = state.value.boss;
  const legacy = boss.legacy;
  const rating = boss.points[boss.points.length - 1]?.rating ?? RATING.START;
  const progress = displayedRankProgress(rating, boss.rank);
  const calibrating = legacy.points[legacy.points.length - 1]?.calibrating ?? false;
  const weighting = bossWeightingOf(configuration);
  const ladder = rankLadder(boss.peakRank);

  /*
   * The overall trend and the overall daily row: the last `range` days of
   * the legacy progression, exactly as Verlauf drew them. The curve plots the
   * rating itself, which is already an exponentially weighted average, so the
   * window is one day; days before the first scored one carry no rating.
   */
  const start = Math.max(0, legacy.history.days.length - range);
  const windowDays = legacy.history.days.slice(start);
  const trend = buildTrend(
    legacy.points.slice(start).map((point, index) => ({
      date: point.date,
      value:
        legacy.firstScoredDate !== null && point.date >= legacy.firstScoredDate
          ? point.rating
          : null,
      inactive: !legacy.history.activity[start + index],
    })),
    { window: 1 },
  );
  const overallRow = legacy.history.overall.slice(start);

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
          <div data-card className="rank-hero">
            {reveal ? <span className="rank-hero__flash" aria-hidden="true" /> : null}
            {reveal ? <span className="rank-hero__pill">{t('rank.newRank')}</span> : null}

            <RankBadge rankId={boss.rank.id} size={148} animate={reveal} />

            <div>
              <p className="rank-hero__kicker">{t('rank.boss')}</p>
              {/* Rank names stay English in every language. */}
              <p className="rank-hero__name">{boss.rank.name}</p>
              <p className="rank-hero__rating">
                {Math.round(rating)} / {RATING.MAX}
              </p>
            </div>

            <RankProgressBar progress={progress} className="rank-progress--hero" />

            {calibrating ? (
              <p className="rank-hero__note">
                {t('rank.calibrating', { days: RATING.CALIBRATION_DAYS })}
              </p>
            ) : null}
          </div>
        </Section>

        {/* The three progression concepts, kept strictly distinct. */}
        <Section>
          <Card rows>
            <div className="standing">
              <RankBadge rankId={boss.rank.id} size={38} />
              <span className="standing__label">
                <span className="standing__name">{t('rank.current')}</span>
                <span className="standing__hint">{t('rank.explainCurrent')}</span>
              </span>
              <span className="standing__value">{boss.rank.name}</span>
            </div>
            <div className="standing">
              <RankBadge rankId={boss.peakRank.id} size={38} />
              <span className="standing__label">
                <span className="standing__name">{t('rank.peak')}</span>
                <span className="standing__hint">{t('rank.explainPeak')}</span>
              </span>
              <span className="standing__value">{boss.peakRank.name}</span>
            </div>
            <div className="standing">
              <span className="standing__mark" aria-hidden="true">
                XP
              </span>
              <span className="standing__label">
                <span className="standing__name">{t('rank.xp')}</span>
                <span className="standing__hint">{t('rank.explainXp')}</span>
              </span>
              <span className="standing__value">{formatNumber(language, boss.lifetimeXp)}</span>
            </div>
          </Card>
        </Section>

        {/* The combined development: the trend curve and the overall daily
            row. Global, so it lives on the global screen; the domains' own
            rows live in their terminals. */}
        <Section label={t('progress.trendTitle')}>
          <div className="progress__ranges">
            <Segmented<string>
              label={t('progress.trendTitle')}
              value={String(range)}
              onChange={(next) => setRange(Number(next))}
              options={TREND_RANGES.map((days) => ({
                value: String(days),
                label: t('progress.rangeDays', { count: days }),
              }))}
            />
          </div>
          <Card>
            {trend.hasTrend ? (
              <div className="trend">
                <div className="trend__header">
                  <span className="trend__range">{t('progress.rangeDays', { count: range })}</span>
                  <span className={`trend__direction trend__direction--${trend.direction}`}>
                    <span aria-hidden="true">
                      {trend.direction === 'rising' ? '↗' : trend.direction === 'falling' ? '↘' : '→'}
                    </span>
                    {t(
                      trend.direction === 'rising'
                        ? 'progress.rising'
                        : trend.direction === 'falling'
                          ? 'progress.falling'
                          : 'progress.steady',
                    )}
                  </span>
                </div>

                <TrendCurve trend={trend} rangeDays={range} />

                <div className="trend__figures">
                  <div className="trend__figure">
                    <span className="trend__figureLabel">{t('progress.current')}</span>
                    <span className="trend__figureValue">
                      {trend.current === null ? '–' : `${Math.round(trend.current)} / ${RATING.MAX}`}
                    </span>
                  </div>
                  <div className="trend__figure trend__figure--muted">
                    <span className="trend__figureLabel">
                      {t('progress.previous', { count: range })}
                    </span>
                    <span className="trend__figureValue">
                      {trend.previous === null ? '–' : Math.round(trend.previous)}
                    </span>
                  </div>
                </div>

                {trend.annotations.length > 0 ? (
                  <div className="trend__notes">
                    {trend.annotations.slice(0, 2).map((annotation, index) => (
                      <p key={index} className="trend__note">
                        <span className="trend__noteDot" aria-hidden="true" />
                        {annotation.kind === 'peak'
                          ? `${t('progress.annotationPeak')} · ${formatDayAndMonth(language, annotation.date)}`
                          : t('progress.annotationGap', { count: annotation.days ?? 0 })}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon={<RankIcon size={24} />}
                title={t('progress.noTrendTitle')}
                body={t('progress.noTrendBody')}
              />
            )}
          </Card>
          {overallRow.some((value) => value !== null) ? (
            <Card className="rank__overallRow">
              <Heatmap
                rows={[{ key: 'overall', label: t('progress.overall'), values: overallRow }]}
                days={windowDays.map((day) => day.date)}
              />
            </Card>
          ) : null}
        </Section>

        {/* Domain ranks: same family, subordinate size, one line each. */}
        <Section label={t('rank.domains')}>
          <Card>
            <p className="rank-section__explain">{t('rank.domains.explain')}</p>
            {boss.domains
              .filter((domain) => configuration.domains[domain.domain]?.enabled)
              .map((domain) => {
                const domainProgress = displayedRankProgress(domain.momentum, domain.rank);
                return (
                  <div key={domain.domain} className="domain-rank">
                    <RankBadge
                      rankId={domain.rank.id}
                      size={34}
                      mystery={!domain.started}
                    />
                    <span className="domain-rank__body">
                      <span className="domain-rank__name">{t(DOMAIN_NAMES[domain.domain])}</span>
                      <span className="domain-rank__rank">
                        {domain.started ? domain.rank.name : t('rank.domain.notStarted')}
                      </span>
                    </span>
                    {domain.started ? (
                      <RankProgressBar
                        progress={domainProgress}
                        className="rank-progress--compact"
                      />
                    ) : null}
                  </div>
                );
              })}
          </Card>
        </Section>

        <Section label={t('rank.weights')}>
          <BossWeights weighting={weighting} onChange={onSetBossWeights} />
        </Section>

        {/*
          Every rank, browsable. An unearned one keeps its name, its threshold
          and its silhouette; what it does not get is the emblem.
        */}
        <Section label={t('rank.ladder')}>
          <Card rows>
            {ladder.map(({ rank, earned }) => (
              <div
                key={rank.id}
                className={`ladder-row ${earned ? '' : 'ladder-row--locked'}`.trim()}
              >
                <RankBadge rankId={rank.id} size={34} mystery={!earned} />
                <span className="ladder-row__body">
                  <span className="ladder-row__name">{rank.name}</span>
                  <span className="ladder-row__from">
                    {t('rank.ladder.from', { points: rank.min })}
                  </span>
                </span>
                {/* Never colour alone: the state is a word. */}
                <span className={`badge ${earned ? 'badge--boolean' : 'badge--paused'}`}>
                  {earned ? t('rank.ladder.earned') : t('rank.ladder.locked')}
                </span>
              </div>
            ))}
          </Card>
        </Section>

        <Section label={t('rank.streaks')}>
          <Card>
            <div className="streaks">
              <div className="streak">
                <p className="streak__label">{t('rank.streakCheckIn')}</p>
                <p className="streak__value">{streakLabel(legacy.checkInStreak.current, 'days')}</p>
                <p className="streak__best">
                  {t('rank.streakBest', { count: legacy.checkInStreak.best })}
                </p>
              </div>
              <div className="streak">
                <p className="streak__label">{t('rank.streakTraining')}</p>
                <p className="streak__value">
                  {streakLabel(legacy.trainingStreak.current, 'weeks')}
                </p>
                <p className="streak__best">
                  {t('rank.streakBest', { count: legacy.trainingStreak.best })}
                </p>
              </div>
            </div>
          </Card>
        </Section>

        <Section label={t('rank.history')}>
          <Card rows>
            {boss.changes.length === 0 ? (
              <EmptyState icon={<RankIcon size={24} />} title={t('rank.historyEmpty')} />
            ) : (
              [...boss.changes]
                .reverse()
                .slice(0, 6)
                .map((change) => (
                  <div key={`${change.date}-${change.to}`} className="rank-change">
                    {/* The badge that was reached, with the direction kept as
                        a separate glyph — colour is never the only carrier. */}
                    <span className="rank-change__badge" aria-hidden="true">
                      <RankBadge rankId={change.to} size={32} />
                      <span className={`rank-change__mark rank-change__mark--${change.kind}`}>
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
