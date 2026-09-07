import { EDIT_WINDOW_DAYS, SCALE_MAX, SCALE_MIN } from './constants';
import type {
  AppConfigSnapshot,
  DomainConfigSnapshot,
  DomainRecord,
  QuestionConfigSnapshot,
  QuestionRecord,
} from '../model';
import { activationOf } from '../domains';
import { equalWeights, weightsForSnapshot, type BossWeights } from '../boss';

/**
 * Config snapshots (§18).
 *
 * Momentum stores source events and derives everything else, which only works
 * if the configuration each event happened under can be reconstructed. Rather
 * than a full effective-dated revision system, version 1 appends a snapshot
 * whenever scoring-relevant configuration changes and resolves any past day
 * to the latest snapshot effective on or before it.
 */

function toQuestionSnapshot(question: QuestionRecord): QuestionConfigSnapshot {
  return {
    id: question.id,
    domainId: question.domainId,
    text: question.text,
    type: question.type,
    status: question.status,
  };
}

function toDomainSnapshot(domain: DomainRecord): DomainConfigSnapshot {
  return {
    id: domain.id,
    type: domain.type,
    enabled: domain.enabled,
    settings: domain.settings,
  } as DomainConfigSnapshot;
}

/**
 * Boss weights are part of the snapshot, and that is the whole of D3.
 *
 * Because every past day is evaluated against the snapshot in force on it,
 * changing the weights today changes what today and every later day mean and
 * cannot reach a single day before. There is no append-only Boss log to keep
 * in step, and nothing stored that could drift from what is replayed.
 *
 * **A snapshot with no `boss` field at all was written by RC2.** The replay
 * reads that absence as "one undivided progression", which is exactly what
 * RC2 had — so upgrading cannot move a day of anyone's existing history. Every
 * snapshot this build writes carries weights, so the marker stays unambiguous.
 */
export function buildConfigSnapshot(
  domains: DomainRecord[],
  questions: QuestionRecord[],
  bossWeights?: BossWeights,
): AppConfigSnapshot {
  const enabled = activationOf(domains).enabled;
  return {
    boss: {
      weights: bossWeights
        ? weightsForSnapshot(bossWeights, enabled)
        : equalWeights(enabled),
    },
    domains: [...domains].sort((a, b) => a.id.localeCompare(b.id)).map(toDomainSnapshot),
    // Archived questions stay in the snapshot: a day in the past was scored
    // with them, and dropping them would silently rewrite that day.
    questions: [...questions].sort((a, b) => a.id.localeCompare(b.id)).map(toQuestionSnapshot),
    scoring: {
      editWindowDays: EDIT_WINDOW_DAYS,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
    },
  };
}

/**
 * Two snapshots are equal when nothing that affects scoring differs. Ordering
 * is normalised in `buildConfigSnapshot`, so a structural comparison is exact
 * and cheap — and it keeps the snapshot log proportional to real change.
 */
export function configSnapshotsEqual(a: AppConfigSnapshot, b: AppConfigSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
