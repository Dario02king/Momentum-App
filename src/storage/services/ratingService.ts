import { today } from '../../core/clock';
import type { DateKey } from '../../core/dates';
import { computeRating, type RatingPoint } from '../../core/rating';
import {
  rankHistory,
  rankForRating,
  type Rank,
  type RankChange,
} from '../../core/ranks';
import { computeXp } from '../../core/scoring/xp';
import { mentalStreak, sportsStreak, type Streak } from '../../core/streaks';
import { configSnapshotsRepository, settingsRepository } from '../repositories';
import { loadHistory, type History } from './historyService';

/**
 * Everything the Rank screen shows, and the rating series the Progress
 * screen plots.
 *
 * All of it is **replayed from history**, never stored and read back. That is
 * what keeps a past rating stable: the fold reads day scores that were
 * themselves reconstructed against the configuration in force on each day, so
 * changing a question or a target today cannot move what the rating was last
 * month. Nothing here reads forwards.
 */

export interface Progression {
  /** First day the app had any configuration at all. */
  origin: DateKey;
  /** The whole history, one point per day since the origin. */
  points: RatingPoint[];
  /** First day that actually scored — before this there is nothing to show. */
  firstScoredDate: DateKey | null;
  current: number;
  peak: number;
  rank: Rank;
  peakRank: Rank;
  lifetimeXp: number;
  checkInStreak: Streak;
  trainingStreak: Streak;
  changes: RankChange[];
  lastPromotion: RankChange | null;
  history: History;
}

function mentalCounts(history: History, index: number) {
  const day = history.days[index]!;
  const mental = day.domains.find((domain) => domain.domain === 'mental');
  return {
    due: mental?.itemsDue ?? 0,
    answered: mental?.itemsAnswered ?? 0,
  };
}

/** The first day anything was configured; before it, nothing is scored. */
export async function progressionOrigin(): Promise<DateKey> {
  const [snapshots, settings] = await Promise.all([
    configSnapshotsRepository.list(),
    settingsRepository.getOrCreate(),
  ]);
  const earliest = snapshots[0]?.effectiveFrom;
  if (!earliest) return settings.firstUseDate;
  return earliest < settings.firstUseDate ? earliest : settings.firstUseDate;
}

export async function loadProgression(reference: DateKey = today()): Promise<Progression> {
  const origin = await progressionOrigin();
  const history = await loadHistory(origin, reference, reference);

  const ratingDays = history.days.map((day, index) => {
    const counts = mentalCounts(history, index);
    return {
      date: day.date,
      status: day.status,
      score: day.score,
      recorded: history.activity[index] ?? false,
      // A complete check-in means every due item answered. With no mental
      // questions at all there is nothing to complete, so a sports-only day
      // does not silently earn a check-in streak.
      complete: counts.due > 0 && counts.answered === counts.due,
    };
  });

  const rating = computeRating(ratingDays);
  const series = rating.points.map((point) => ({ date: point.date, rating: point.rating }));
  const ranks = rankHistory(series);

  const firstScoredIndex = history.days.findIndex((day) => day.status === 'scored');
  const firstScoredDate = firstScoredIndex >= 0 ? history.days[firstScoredIndex]!.date : null;

  const checkInStreak = mentalStreak(
    ratingDays.map((day) => ({
      date: day.date,
      complete: day.complete,
      counts: day.status === 'scored',
    })),
  );

  const trainingStreak = sportsStreak(
    history.weeks
      .filter((week) => week.target !== null)
      .map((week) => ({ weekKey: week.weekKey, met: week.met, inProgress: week.inProgress })),
  );

  const lifetimeXp = computeXp(
    history.days.map((day, index) => {
      const counts = mentalCounts(history, index);
      return {
        answeredItems: counts.answered,
        complete: counts.due > 0 && counts.answered === counts.due,
        counts: day.status === 'scored',
      };
    }),
    history.weeks.map((week) => ({
      sessions: week.sessions,
      met: week.met,
      inProgress: week.inProgress,
    })),
  );

  const promotions = ranks.changes.filter((change) => change.kind === 'promotion');

  return {
    origin,
    points: rating.points,
    firstScoredDate,
    current: rating.current,
    peak: rating.peak,
    rank: ranks.current,
    // Peak rank never decreases, and inactivity decay cannot touch it.
    peakRank: ranks.peak.index >= ranks.current.index ? ranks.peak : rankForRating(rating.peak),
    lifetimeXp,
    checkInStreak,
    trainingStreak,
    changes: ranks.changes,
    lastPromotion: promotions[promotions.length - 1] ?? null,
    history,
  };
}
