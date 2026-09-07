import type {
  DomainRecord,
  GymSessionRecord,
  LegacySportMigration,
  RunRecord,
  SportsSessionRecord,
} from '../model';

/**
 * What became of RC2's generic Sport domain.
 *
 * RC2 shipped one weekly-quota Sport domain. Iteration 2 has no generic Sport
 * rank at all — training splits into Gym and Running, which are scored on
 * different things. Every device carrying RC2 data therefore holds sessions
 * whose meaning the app does not know.
 *
 * **It does not guess.** There is no preselected answer and no default that
 * resolves itself: until the user says what those sessions were, the sports
 * domain is left exactly as it is and the app stays fully usable. The choice
 * is offered once, and it is made of exactly three branches:
 *
 * - `gym`     — they were gym sessions.
 * - `running` — they were runs.
 * - `kept`    — leave them as read-only legacy history; Gym and Running start
 *               empty.
 *
 * ## The legacy rows are copied, never moved
 *
 * Converting does not delete the RC2 sport sessions, and that is not
 * tidiness — it is the only way the past survives. Every day before the
 * conversion resolves to a config snapshot in which Sport is the enabled
 * weekly domain, and those snapshots are never rewritten. Deleting the rows
 * they refer to would turn a year of met targets into a year of empty weeks:
 * the user's history would be rewritten by an act that was supposed to
 * reinterpret it. The rows stay; the domain that holds them going forward
 * changes.
 *
 * ## What is carried, and what is emphatically not
 *
 * A converted session carries only what RC2 actually recorded: its date, its
 * week, when it happened, its note, and — for a run — the duration, but only
 * where the user entered one. **No distance, pace, elevation or step count is
 * invented**, because RC2 never asked for any of them. A converted record is
 * marked `legacyCarryOver`, which is what lets the Gym and Running screens
 * say "carried over from your earlier training log, without workout detail"
 * instead of showing a session that looks like it lost its data.
 *
 * ## What a carried-over session counts for
 *
 * Attendance, weekly-target consistency and XP — every quantity RC2 already
 * awarded for it. It contributes nothing to strength, volume, muscle
 * performance or distance, because there is nothing to contribute.
 *
 * ## What happens to the user's rank
 *
 * Nothing, and this is the part that matters most. Progression is replayed
 * from days scored against the snapshot in force on each of them, and every
 * pre-upgrade snapshot carries no Boss weights — the replay reads that
 * absence as "one undivided progression", which is exactly what RC2 was. The
 * user's existing rank, rating, peak and lifetime XP are therefore
 * grandfathered in whichever branch they choose: converting sessions changes
 * which domain shows them going forward, never what the past was worth.
 */
export type LegacySportChoice = Extract<LegacySportMigration, 'gym' | 'running' | 'kept'>;

export const LEGACY_SPORT_CHOICES: LegacySportChoice[] = ['gym', 'running', 'kept'];

export interface LegacySportPlan {
  choice: LegacySportChoice;
  /** Sessions to write into the gym log. Empty unless the choice is `gym`. */
  gymSessions: GymSessionRecord[];
  /** Runs to write. Empty unless the choice is `running`. */
  runs: RunRecord[];
  /**
   * Whether the sports domain stops being an active domain **from today**.
   *
   * Disabling appends a config snapshot, so it takes effect forward only:
   * every week already lived keeps the target it was scored against. `kept`
   * leaves it enabled, because that is what the user asked for.
   */
  retireSportsDomain: boolean;
  /**
   * The weekly target the new domain inherits.
   *
   * Not a fabrication — it is the number the user themselves set on the
   * sports domain, moved to the domain that now holds those sessions. A
   * `kept` choice inherits nothing, because nothing moves.
   */
  inheritedTargetPerWeek: number | null;
}

export interface LegacySportInput {
  sessions: readonly SportsSessionRecord[];
  sportsDomain: DomainRecord | undefined;
  choice: LegacySportChoice;
  /** Injected so a plan is deterministic and testable. */
  newId: (session: SportsSessionRecord) => string;
  now: string;
}

const targetOf = (domain: DomainRecord | undefined): number | null =>
  domain && domain.type === 'sports' ? domain.settings.targetPerWeek : null;

export function planLegacySportMigration(input: LegacySportInput): LegacySportPlan {
  const { sessions, choice, newId, now } = input;

  if (choice === 'kept') {
    return {
      choice,
      gymSessions: [],
      runs: [],
      retireSportsDomain: false,
      inheritedTargetPerWeek: null,
    };
  }

  const inheritedTargetPerWeek = targetOf(input.sportsDomain);

  if (choice === 'gym') {
    return {
      choice,
      gymSessions: sessions.map((session) => ({
        id: newId(session),
        date: session.date,
        weekKey: session.weekKey,
        performedAt: session.performedAt,
        planId: null,
        note: session.note,
        legacyCarryOver: true,
        configSnapshotId: session.configSnapshotId,
        createdAt: session.createdAt,
        updatedAt: now,
      })),
      runs: [],
      retireSportsDomain: true,
      inheritedTargetPerWeek,
    };
  }

  return {
    choice,
    gymSessions: [],
    runs: sessions.map((session) => ({
      id: newId(session),
      date: session.date,
      weekKey: session.weekKey,
      performedAt: session.performedAt,
      source: 'manual' as const,
      externalId: null,
      // RC2 never recorded distance, elevation or steps for a session, and a
      // plausible-looking number is worse than an honest absence.
      distanceMetres: null,
      // Duration is the one metric RC2 did offer, and only sometimes.
      durationSeconds:
        session.durationMinutes === null ? null : Math.round(session.durationMinutes * 60),
      elevationMetres: null,
      steps: null,
      note: session.note,
      legacyCarryOver: true,
      configSnapshotId: session.configSnapshotId,
      createdAt: session.createdAt,
      updatedAt: now,
    })),
    retireSportsDomain: true,
    inheritedTargetPerWeek,
  };
}

/**
 * Whether the user still has to be asked.
 *
 * `undefined` covers a record written before this field existed and is read
 * as "nothing to decide" rather than "ask again": a device that never had a
 * sports domain must never see the question.
 */
export function needsLegacySportChoice(state: LegacySportMigration | undefined): boolean {
  return state === 'pending';
}
