import { EDIT_WINDOW_DAYS, SCALE_MAX, SCALE_MIN } from './constants';
import type {
  AppConfigSnapshot,
  DomainConfigSnapshot,
  DomainRecord,
  QuestionConfigSnapshot,
  QuestionRecord,
} from '../model';

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
    rhythm: question.rhythm,
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

export function buildConfigSnapshot(
  domains: DomainRecord[],
  questions: QuestionRecord[],
): AppConfigSnapshot {
  return {
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
