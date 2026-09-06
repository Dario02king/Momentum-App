import { SPORTS } from '../../core/config/constants';
import type {
  DomainRecord,
  QuestionRecord,
  QuestionStatus,
  QuestionType,
  SettingsRecord,
} from '../../core/model';
import { ensureCurrentSnapshot } from '../configService';
import {
  domainsRepository,
  questionsRepository,
  settingsRepository,
} from '../repositories';

/**
 * Everything the configuration surfaces read and write.
 *
 * Two invariants live here rather than in the UI:
 *
 * 1. A domain record is created the first time it is enabled, never before.
 *    A user who skips Sports has no sports domain at all, and scoring
 *    therefore excludes it rather than scoring it as zero.
 * 2. Every scoring-relevant change appends a configuration revision, so a
 *    past day is always read back through the configuration it was lived
 *    under. Changing the language does not, because it changes nothing that
 *    is scored.
 */

export interface AppConfiguration {
  settings: SettingsRecord;
  mental: DomainRecord | null;
  sports: DomainRecord | null;
  /** Every question, including paused and archived ones. */
  questions: QuestionRecord[];
}

/** Display order for the two domains version 1 knows about. */
const DOMAIN_ORDER = { mental: 0, sports: 1 } as const;

export async function loadConfiguration(): Promise<AppConfiguration> {
  const [settings, domains, questions] = await Promise.all([
    settingsRepository.getOrCreate(),
    domainsRepository.list(),
    questionsRepository.list(),
  ]);
  return {
    settings,
    mental: domains.find((domain) => domain.type === 'mental') ?? null,
    sports: domains.find((domain) => domain.type === 'sports') ?? null,
    questions,
  };
}

export function sportsTargetOfDomain(domain: DomainRecord | null): number | null {
  if (!domain || domain.type !== 'sports' || !domain.enabled) return null;
  return domain.settings.targetPerWeek;
}

export function clampSportsTarget(target: number): number {
  const rounded = Math.round(target);
  if (!Number.isFinite(rounded)) return SPORTS.DEFAULT_TARGET_PER_WEEK;
  return Math.min(SPORTS.MAX_TARGET_PER_WEEK, Math.max(SPORTS.MIN_TARGET_PER_WEEK, rounded));
}

/** Enables Mental Wellbeing, creating its record the first time. */
export async function enableMental(): Promise<DomainRecord> {
  const existing = await domainsRepository.findByType('mental');
  const domain = existing
    ? ((await domainsRepository.setEnabled(existing.id, true)) ?? existing)
    : await domainsRepository.ensure('mental', DOMAIN_ORDER.mental, {});
  await ensureCurrentSnapshot();
  return domain;
}

/**
 * Enables Sports with a weekly target, creating its record the first time.
 * Re-enabling an existing domain keeps whatever target it already had unless
 * a new one is given.
 */
export async function enableSports(targetPerWeek?: number): Promise<DomainRecord> {
  const existing = await domainsRepository.findByType('sports');
  let domain: DomainRecord;
  if (!existing) {
    domain = await domainsRepository.ensure('sports', DOMAIN_ORDER.sports, {
      targetPerWeek: clampSportsTarget(targetPerWeek ?? SPORTS.DEFAULT_TARGET_PER_WEEK),
    });
  } else {
    const enabled = (await domainsRepository.setEnabled(existing.id, true)) ?? existing;
    domain =
      targetPerWeek === undefined
        ? enabled
        : ((await domainsRepository.updateSettings(enabled.id, {
            targetPerWeek: clampSportsTarget(targetPerWeek),
          })) ?? enabled);
  }
  await ensureCurrentSnapshot();
  return domain;
}

/**
 * Disabling a domain stops it counting from today onwards. It never deletes
 * anything: the history stays, and the revisions record when it stopped.
 */
export async function disableDomain(id: string): Promise<void> {
  await domainsRepository.setEnabled(id, false);
  await ensureCurrentSnapshot();
}

export async function setSportsTarget(targetPerWeek: number): Promise<DomainRecord> {
  return enableSports(targetPerWeek);
}

export interface QuestionDraft {
  text: string;
  type: QuestionType;
}

export async function addQuestion(draft: QuestionDraft): Promise<QuestionRecord> {
  const domain = await enableMental();
  const question = await questionsRepository.create({
    domainId: domain.id,
    text: draft.text,
    type: draft.type,
  });
  await ensureCurrentSnapshot();
  return question;
}

/**
 * Editing a question never rewrites the past. The change takes effect from
 * today's revision onwards; days already scored keep the wording and type
 * they were answered under.
 */
export async function updateQuestion(
  id: string,
  patch: Partial<QuestionDraft>,
): Promise<QuestionRecord | undefined> {
  const updated = await questionsRepository.update(id, {
    ...(patch.text === undefined ? {} : { text: patch.text.trim() }),
    ...(patch.type === undefined ? {} : { type: patch.type }),
  });
  await ensureCurrentSnapshot();
  return updated;
}

export async function setQuestionStatus(
  id: string,
  status: QuestionStatus,
): Promise<QuestionRecord | undefined> {
  const updated = await questionsRepository.setStatus(id, status);
  await ensureCurrentSnapshot();
  return updated;
}

export const pauseQuestion = (id: string) => setQuestionStatus(id, 'paused');
export const resumeQuestion = (id: string) => setQuestionStatus(id, 'active');
/** Archiving hides a question. Its answers stay, and old days keep counting. */
export const archiveQuestion = (id: string) => setQuestionStatus(id, 'archived');

export interface OnboardingSelection {
  questions: QuestionDraft[];
  /** `null` means the user skipped Sports. */
  sportsTargetPerWeek: number | null;
}

/**
 * Writes the choices made during onboarding and marks it complete.
 *
 * Both domains are optional: an empty selection is valid and leaves the user
 * on an app with nothing configured but everything reachable.
 */
export async function applyOnboarding(selection: OnboardingSelection): Promise<AppConfiguration> {
  if (selection.questions.length > 0) {
    const domain = await enableMental();
    let order = 0;
    for (const draft of selection.questions) {
      await questionsRepository.create({
        domainId: domain.id,
        text: draft.text,
        type: draft.type,
        order: order++,
      });
    }
  }

  if (selection.sportsTargetPerWeek !== null) {
    await enableSports(selection.sportsTargetPerWeek);
  }

  await ensureCurrentSnapshot();
  await settingsRepository.completeOnboarding();
  return loadConfiguration();
}

/** Lets the user run onboarding again from Areas without losing history. */
export async function resetOnboardingFlag(): Promise<void> {
  await settingsRepository.update({ onboardingCompletedAt: null });
}
