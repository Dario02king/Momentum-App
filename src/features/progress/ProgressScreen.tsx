import { useMemo, useState } from 'react';
import { TREND_RANGES, TREND_SMOOTHING_DAYS } from '../../core/config/constants';
import { buildTrend } from '../../core/trends';
import { Card, EmptyState, Section, Segmented } from '../../components';
import { ProgressIcon } from '../../components/Icons';
import { formatDayAndMonth } from '../../i18n/format';
import { useI18n, useT } from '../../i18n/I18nProvider';
import { Heatmap, type HeatmapRow } from './Heatmap';
import { TrendCurve } from './TrendCurve';
import { useHistory } from './useHistory';
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
  const state = useHistory(range);

  const trend = useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildTrend(
      state.history.days.map((day, index) => ({
        date: day.date,
        value: day.score,
        inactive: !state.history.activity[index],
      })),
      { window: TREND_SMOOTHING_DAYS },
    );
  }, [state]);

  const rows: HeatmapRow[] = useMemo(() => {
    if (state.status !== 'ready') return [];
    const { history } = state;
    const result: HeatmapRow[] = [
      { key: 'overall', label: t('progress.overall'), values: history.overall },
    ];
    if (history.mental.some((value) => value !== null) || history.questions.length > 0) {
      result.push({
        key: 'mental',
        label: t('domain.mental'),
        values: history.mental,
        children: history.questions.map((question) => ({
          key: question.id,
          label: question.text,
          values: question.scores,
        })),
      });
    }
    if (history.sports.some((value) => value !== null)) {
      result.push({ key: 'sports', label: t('domain.sports'), values: history.sports });
    }
    return result;
  }, [state, t]);

  if (state.status !== 'ready') {
    return <div className="screen" aria-busy={state.status === 'loading'} />;
  }

  const { history } = state;
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

        {history.empty ? (
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
                          {trend.current === null ? '–' : `${Math.round(trend.current)} %`}
                        </span>
                      </div>
                      <div className="trend__figure trend__figure--muted">
                        <span className="trend__figureLabel">
                          {t('progress.previous', { count: range })}
                        </span>
                        <span className="trend__figureValue">
                          {trend.previous === null ? '–' : `${Math.round(trend.previous)} %`}
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
                <Heatmap rows={rows} days={history.days.map((day) => day.date)} />
              </Card>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
