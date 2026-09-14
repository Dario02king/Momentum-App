import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClock } from '../../core/clock';
import { BACKUP_FORMAT_VERSION } from '../../core/backup/format';
import { SCHEMA_VERSION } from '../../core/model';
import { canonicalJson } from '../../testing/canonical';
import { closeDatabase, deleteDatabase } from '../db';
import { gymPlansRepository, gymSessionsRepository } from '../repositories';
import { applyOnboarding } from './configurationService';
import { exportBackup, importBackup, inspectBackup } from './backupService';
import { addSet, draftFromPlan, ensureExerciseCatalogue, loadSession, startSessionFromDraft } from './gymService';
import { createTrainingPlan, listTrainingPlans } from './trainingPlanService';

/**
 * Plans and session snapshots in a backup (WP2-1M).
 *
 * No new store, no new collection and no new envelope version: the plans
 * live in `gymPlans`, which format version 2 already carries, and the
 * snapshot is a field on a session row. So a file written before WP2-1
 * still imports, a file written after it round-trips whole, and a file
 * carrying a `gymPlans` record of the shape the store was originally
 * declared for is neither refused nor shown as a plan.
 */

function freezeAt(day: string, hour = 9): void {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  setClock({ now: () => new Date(y, m - 1, d, hour, 0, 0) });
}

const MONDAY = '2026-03-02';

beforeEach(async () => {
  await deleteDatabase();
  freezeAt(MONDAY);
  await applyOnboarding({ questions: [], gymTargetPerWeek: 3 });
  await ensureExerciseCatalogue();
});

afterEach(async () => {
  setClock(null);
  await closeDatabase();
});

describe('a backup with plans and plan sessions', () => {
  it('keeps the format and schema versions', () => {
    expect(SCHEMA_VERSION).toBe(5);
    expect(BACKUP_FORMAT_VERSION).toBe(3);
  });

  it('round-trips plans, the session snapshot and the sets exactly', async () => {
    const plan = await createTrainingPlan({
      name: 'Push A',
      exercises: [{ exerciseId: 'ex_bench_press' }, { exerciseId: 'ex_dip' }],
    });
    const session = await startSessionFromDraft(draftFromPlan(plan), MONDAY);
    await addSet({ sessionId: session.id, exerciseId: 'ex_bench_press', reps: 8, weightGrams: 60000 });

    const before = await exportBackup();
    const plansBefore = canonicalJson(await listTrainingPlans());
    const sessionBefore = canonicalJson(await gymSessionsRepository.get(session.id));
    const viewBefore = canonicalJson(await loadSession(session.id));

    await deleteDatabase();
    const result = await importBackup(JSON.stringify(before));
    expect(result.ok).toBe(true);

    expect(canonicalJson(await listTrainingPlans())).toBe(plansBefore);
    expect(canonicalJson(await gymSessionsRepository.get(session.id))).toBe(sessionBefore);
    expect(canonicalJson(await loadSession(session.id))).toBe(viewBefore);
    expect(canonicalJson((await exportBackup()).data)).toBe(canonicalJson(before.data));
  });

  it('imports a file written before WP2-1, with no plans and no snapshots', async () => {
    const file = await exportBackup();
    const data = file.data as unknown as Record<string, unknown>;
    delete data.gymPlans;
    const text = JSON.stringify({ ...file, data });
    await deleteDatabase();
    const result = await importBackup(text);
    expect(result.ok).toBe(true);
    expect(await listTrainingPlans()).toEqual([]);
  });

  it('carries a legacy-shaped gymPlans record through without showing it as a plan', async () => {
    const file = await exportBackup();
    const legacy = {
      id: 'plan_legacy',
      daysPerWeek: 3,
      focus: 'fullBody',
      goal: 'mixed',
      volume: 'medium',
      muscles: ['chest'],
      editedAt: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    const text = JSON.stringify({ ...file, data: { ...file.data, gymPlans: [legacy] } });
    const inspected = inspectBackup(text);
    expect(inspected.ok).toBe(true);
    await deleteDatabase();
    expect((await importBackup(text)).ok).toBe(true);
    expect(await listTrainingPlans()).toEqual([]);
    expect(await gymPlansRepository.getAll()).toEqual([legacy]);
    // And it is exported again, untouched — never silently dropped.
    expect((await exportBackup()).data.gymPlans).toEqual([legacy]);
  });

  it('refuses a training plan record that is malformed', async () => {
    const file = await exportBackup();
    const broken = {
      id: 'plan_x',
      kind: 'userTrainingPlan',
      version: 1,
      name: 'Push',
      exercises: [{ exerciseId: '', name: 'x', order: 0 }],
      createdAt: '2026-03-02T09:00:00.000Z',
      updatedAt: '2026-03-02T09:00:00.000Z',
    };
    const result = inspectBackup(JSON.stringify({ ...file, data: { ...file.data, gymPlans: [broken] } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toBe('malformed');
      expect(result.details.join('\n')).toMatch(/gymPlans\[0\]/);
    }
  });

  it('refuses a training plan from a version it does not know', async () => {
    const file = await exportBackup();
    const future = {
      id: 'plan_y',
      kind: 'userTrainingPlan',
      version: 2,
      name: 'Push',
      exercises: [],
      createdAt: '2026-03-02T09:00:00.000Z',
      updatedAt: '2026-03-02T09:00:00.000Z',
    };
    const result = inspectBackup(JSON.stringify({ ...file, data: { ...file.data, gymPlans: [future] } }));
    expect(result.ok).toBe(false);
  });
});
