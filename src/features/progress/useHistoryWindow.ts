import { useMemo } from 'react';
import type { DateKey } from '../../core/dates';
import type { RatingPoint } from '../../core/rating';
import type { DayScore } from '../../core/scoring/dayScore';
import type { History } from '../../storage/services/historyService';
import type { Progression } from '../../storage/services/ratingService';

/** The last `range` days of the replay, for every view that shows a range. */
export interface HistoryWindow {
  history: History;
  start: number;
  days: DayScore[];
  activity: boolean[];
  ratings: RatingPoint[];
  firstScoredDate: DateKey | null;
}

export function useHistoryWindow(
  progression: Progression | null,
  range: number,
): HistoryWindow | null {
  return useMemo(() => {
    if (!progression) return null;
    const { history, points, firstScoredDate } = progression;
    const start = Math.max(0, history.days.length - range);
    return {
      history,
      start,
      days: history.days.slice(start),
      activity: history.activity.slice(start),
      ratings: points.slice(start),
      firstScoredDate,
    };
  }, [progression, range]);
}
