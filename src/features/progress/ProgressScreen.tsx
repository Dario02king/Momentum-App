import { useMemo, useState } from 'react';
import { RATING, TREND_RANGES } from '../../core/config/constants';
import { buildTrend } from '../../core/trends';
import { Card, EmptyState, Section, Segmented } from '../../components';
import { ProgressIcon } from '../../components/Icons';
import { formatDayAndMonth } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { Heatmap, type HeatmapRow } from './Heatmap';
import { TrendCurve } from './TrendCurve';
import { useProgression } from './useProgression';
import './progress.css';

/**
 * Progress: the trend curve is the hero, the history grid supports it.
 *
 * The question is directional — am I moving up or down — so the direction is
 * stated in a word before any number, and neither view is ever rendered
 * against zero-filled data.
 */
export function ProgressScreen() {
  const t = useT();
  const { language } = useI18n();
  const [range, setRange] = useState<number>(TREND_RANGES[TREND_RANGES.length - 1]!);
  const state = useProgression();

  /** The last `range` days of the replay, for both views. */
  const window = useMemo(() => {
    if (state.status !== 'ready') return null;
    const { history, points, firstScoredDate } = state.progression;
    const start = Math.max(0, history.days.length - range);
    return {
      history,
      start,
      days: history.days.slice(start),
      activity: history.activity.slice(start),
      ratings: points.slice(start),
      firstScoredDate,
    };
  }, [state, range]);

  /**
   * The curve plots the rating itself, which is already an exponentially
   * weighted average — smoothing it again would flatten the very movement it
   * exists to show, so the window is one day. Days before the first scored
   * one carry no rating to show, and stay out of the series entirely.
   */
  const trend = useMemo(() => {
    if (!window) return null;
    return buildTrend(
      window.ratings.map((point, index) => ({
        date: point.date,
        value:
          window.firstScoredDate !== null && point.date >= window.firstScoredDate
            ? point.rating
            : null,
        inactive: !window.activity[index],
      })),
      { window: 1 },
    );
  }, [window]);

  const rows: HeatmapRow[] = useMemo(() => {
    if (!window) return [];
    const { history, start } = window;
    const slice = <T,>(values: T[]) => values.slice(start);
    const result: HeatmapRow[] = [
      { key: 'overall', label: t('progress.overall'), values: slice(history.overall) },
    ];
    const mental = slice(history.mental);
    if (mental.some((value) => value !== null) || history.questions.length > 0) {
      result.push({
        key: 'mental',
        label: t('domain.mental'),
        values: mental,
        children: history.questions.map((question) => ({
          key: question.id,
          label: question.text,
          values: slice(question.scores),
        })),
      });
    }
    const sports = slice(history.sports);
    if (sports.some((value) => value !== null)) {
      result.push({ key: 'sports', label: t('domain.sports'), values: sports });
    }
    return result;
  }, [window, t]);

  if (state.status !== 'ready' || !window) {
    return <div className="screen" aria-busy={state.status === 'loading'} />;
  }

  const empty = window.days.every((day) => day.score === null);
  const rangeSelector = (
    <div className="progress__ranges">
      <Segmented<string>
        label={t('nav.progress')}
        value={String(range)}
        onChange={(next) => setRange(Number(next))}
        options={TREND_RANGES.map((days) => ({
          value: String(days),
          label: t('progress.rangeDays', { count: days }),
        }))}
      />
    </div>
  );

  return (
    <div className="screen">
      <header className="screen__header">
        <h1 className="screen__title">{t('nav.progress')}</h1>
      </header>

      <div className="progress__scroll">
        {rangeSelector}

        {empty ? (
          <Card>
            <EmptyState
              icon={<ProgressIcon size={26} />}
              title={t('progress.emptyTitle')}
              body={t('progress.emptyBody')}
            />
          </Card>
        ) : (
          <>
            <Section>
              <Card>
                {trend && trend.hasTrend ? (
                  <div className="trend">
                    <div className="trend__header">
                      <span className="trend__range">
                        {t('progress.rangeDays', { count: range })}
                      </span>
                      <span className={`trend__direction trend__direction--${trend.direction}`}>
                        <span aria-hidden="true">
                          {trend.direction === 'rising'
                            ? '↗'
                            : trend.direction === 'falling'
                              ? '↘'
                              : '→'}
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
                          {trend.current === null
                            ? '–'
                            : `${Math.round(trend.current)} / ${RATING.MAX}`}
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
                    icon={<ProgressIcon size={26} />}
                    title={t('progress.noTrendTitle')}
                    body={t('progress.noTrendBody')}
                  />
                )}
              </Card>
            </Section>

            <Section>
              <Card>
                <Heatmap rows={rows} days={window.days.map((day) => day.date)} />
              </Card>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
