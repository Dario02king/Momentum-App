import { nowIso } from '../../core/clock';
import {
  needsLegacySportChoice,
  planLegacySportMigration,
  type LegacySportChoice,
  type LegacySportPlan,
} from '../../core/migration/legacySport';
import type { LegacySportMigration } from '../../core/model';
import { DOMAIN_DEFINITIONS } from '../../core/domains';
import {
  domainsRepository,
  gymSessionsRepository,
  runsRepository,
  settingsRepository,
  sportsSessionsRepository,
} from '../repositories';
import { ensureCurrentSnapshot } from '../configService';

/**
 * Asking the user once what RC2's Sport sessions were, and acting on the
 * answer.
 *
 * The one rule that governs this whole file: **no branch runs by itself.**
 * There is no default choice, no timeout that picks one, and no "most likely"
 * guess. Until the user answers, `legacySportMigration` stays `pending`, the
 * sports domain is untouched, and the app works exactly as it did — a user
 * who never answers loses nothing and sees nothing reinterpreted.
 */

export interface LegacySportPrompt {
  /** Whether the question is still outstanding. */
  needed: boolean;
  /** How many sessions the answer would apply to. */
  sessions: number;
  firstDate: string | null;
  lastDate: string | null;
  /** The weekly target those sessions were logged against. */
  targetPerWeek: number | null;
}

export async function legacySportPrompt(): Promise<LegacySportPrompt> {
  const settings = await settingsRepository.getOrCreate();
  if (!needsLegacySportChoice(settings.legacySportMigration)) {
    return { needed: false, sessions: 0, firstDate: null, lastDate: null, targetPerWeek: null };
  }
  const [sessions, domain] = await Promise.all([
    sportsSessionsRepository.getAll(),
    domainsRepository.findByType('sports'),
  ]);
  const dates = sessions.map((session) => session.date).sort();
  return {
    needed: true,
    sessions: sessions.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    targetPerWeek:
      domain && domain.type === 'sports' ? domain.settings.targetPerWeek : null,
  };
}

export interface LegacySportOutcome {
  choice: LegacySportChoice;
  plan: LegacySportPlan;
  /** What the settings record now says, so a caller need not re-read it. */
  state: LegacySportMigration;
}

/**
 * Applies the user's answer.
 *
 * The order matters. Records are written before the domain change, and the
 * config snapshot is appended last: the snapshot is what makes the change
 * take effect from today forward, so appending it before the data existed
 * would leave a window in which today expected gym sessions that had not
 * been written yet.
 */
export async function applyLegacySportChoice(
  choice: LegacySportChoice,
): Promise<LegacySportOutcome> {
  const [sessions, sportsDomain] = await Promise.all([
    sportsSessionsRepository.getAll(),
    domainsRepository.findByType('sports'),
  ]);

  const plan = planLegacySportMigration({
    sessions,
    sportsDomain,
    choice,
    // Derived from the source id so re-running the same conversion cannot
    // produce a second copy of the same session.
    newId: (session) => `legacy-${session.id}`,
    now: nowIso(),
  });

  if (plan.gymSessions.length > 0) await gymSessionsRepository.putMany(plan.gymSessions);
  if (plan.runs.length > 0) await runsRepository.putMany(plan.runs);

  if (plan.retireSportsDomain) {
    const target =
      plan.inheritedTargetPerWeek ??
      (choice === 'gym'
        ? DOMAIN_DEFINITIONS.gym.defaultSettings.targetPerWeek
        : DOMAIN_DEFINITIONS.running.defaultSettings.targetPerWeek);

    if (choice === 'gym') {
      const domain = await domainsRepository.ensure('gym', DOMAIN_DEFINITIONS.gym.order, {
        targetPerWeek: target,
      });
      await domainsRepository.updateSettings<'gym'>(domain.id, { targetPerWeek: target });
      await domainsRepository.setEnabled(domain.id, true);
    } else {
      const domain = await domainsRepository.ensure('running', DOMAIN_DEFINITIONS.running.order, {
        targetPerWeek: target,
      });
      await domainsRepository.updateSettings<'running'>(domain.id, { targetPerWeek: target });
      await domainsRepository.setEnabled(domain.id, true);
    }

    if (sportsDomain) await domainsRepository.setEnabled(sportsDomain.id, false);
  }

  await settingsRepository.update({ legacySportMigration: choice });
  // Forward only: from today, the weekly quota belongs to the new domain.
  // Every week already lived keeps the snapshot it was scored against.
  await ensureCurrentSnapshot();

  return { choice, plan, state: choice };
}
