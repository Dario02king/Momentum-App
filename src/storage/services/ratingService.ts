import { today } from '../../core/clock';
import { weekKeyOf, type DateKey } from '../../core/dates';
import { computeRating, type DayState, type RatingPoint } from '../../core/rating';
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

  // Sessions across every weekly-quota domain: for the "was the user away"
  // question, a run and a gym session are both evidence that they were not.
  const sessionsByWeek = new Map(
    history.weeks.map((week) => [
      week.weekKey,
      week.domains.reduce((sum, entry) => sum + entry.sessions, 0),
    ]),
  );

  /*
   * The rating folds over reconstructed daily *state*, not just a score.
   *
   * A zero because the user answered "no" and a zero because nothing was
   * recorded are treated differently on purpose, and how much of the day was
   * reported decides how much it counts — none of which can be recovered
   * from the number alone.
   */
  const ratingDays: DayState[] = history.days.map((day, index) => {
    const hadDailyObligation = day.dueItems > 0;
    /*
     * Inactivity means the user was away, not that a particular day was
     * quiet. A weekly target is met over a week, so a rest day inside a week
     * that has training is not absence — decaying it would punish exactly the
     * pattern the target asks for. A day with daily questions due is judged
     * on its own, because there the obligation really is daily.
     */
    const recorded =
      (history.activity[index] ?? false) ||
      (!hadDailyObligation && (sessionsByWeek.get(weekKeyOf(day.date)) ?? 0) > 0);

    return {
      date: day.date,
      status: day.status,
      score: day.score,
      recordedScore: day.recordedScore,
      dueItems: day.dueItems,
      answeredItems: day.answeredItems,
      recorded,
      // A complete check-in means every due item answered. With no mental
      // questions at all there is nothing to complete, so a sports-only day
      // does not silently earn a check-in streak.
      complete: hadDailyObligation && day.answeredItems === day.dueItems,
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


  /*
   * The training streak counts weeks in which every weekly quota the user had
   * set was met. With RC2's single Sport domain that is exactly the old
   * number; with Gym and Running it is "a week you hit both", which is the
   * only reading that stays one number. Per-domain streaks belong with the
   * per-domain screens, not here.
   */
  const trainingStreak = sportsStreak(
    history.weeks
      .filter((week) => week.domains.length > 0)
      .map((week) => ({
        weekKey: week.weekKey,
        met: week.domains.every((entry) => entry.met),
        inProgress: week.inProgress,
      })),
  );

  const lifetimeXp = computeXp(
    history.days.map((day) => ({
      answeredItems: day.answeredItems,
      complete: day.dueItems > 0 && day.answeredItems === day.dueItems,
      counts: day.status === 'scored',
    })),
    // One XP row per domain-week, so hitting two independent targets is worth
    // two targets. With a single domain this is the RC2 total, unchanged.
    history.weeks.flatMap((week) =>
      week.domains.map((entry) => ({
        sessions: entry.sessions,
        met: entry.met,
        inProgress: week.inProgress,
      })),
    ),
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
