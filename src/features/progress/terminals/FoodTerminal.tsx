import { useMemo } from 'react';
import { MetricBoard } from '../../../components/metrics';
import { useT } from '../../../i18n/I18nProvider';
import type { HeatmapRow } from '../Heatmap';
import type { HistoryWindow } from '../useHistoryWindow';
import { DailyHistory } from './DailyHistory';
import { DomainStandingTile } from './DomainStandingTile';

/**
 * Food's terminal.
 *
 * What exists for Food today is the daily 1–10 rating and the rank it feeds;
 * the log and its totals live on Today, where they are entered, and are
 * never scored. So this is the standing and the daily row, and no more —
 * targets, trends and anything from the roadmap arrive here only once they
 * exist in the product (Stage D, and D120 still stands).
 */
export function FoodTerminal({ window }: { window: HistoryWindow }) {
  const t = useT();
  const rows: HeatmapRow[] = useMemo(() => {
    const food = window.history.food.slice(window.start);
    return food.some((value) => value !== null)
      ? [{ key: 'food', label: t('domain.food'), values: food }]
      : [];
  }, [window, t]);

  return (
    <>
      <MetricBoard>
        <DomainStandingTile domain="food" id="food-standing" />
      </MetricBoard>
      <DailyHistory rows={rows} days={window.days.map((day) => day.date)} />
    </>
  );
}
