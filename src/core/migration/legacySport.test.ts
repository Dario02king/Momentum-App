import { describe, expect, it } from 'vitest';
import type { DomainRecord, SportsSessionRecord } from '../model';
import {
  LEGACY_SPORT_CHOICES,
  needsLegacySportChoice,
  planLegacySportMigration,
} from './legacySport';

const session = (overrides: Partial<SportsSessionRecord> = {}): SportsSessionRecord => ({
  id: 'ses_1',
  domainId: 'dom_sports',
  date: '2026-03-02',
  weekKey: '2026-W10',
  performedAt: '2026-03-02T18:00:00.000Z',
  activityType: null,
  note: 'Abends',
  durationMinutes: null,
  detail: null,
  configSnapshotId: 'cfg_1',
  createdAt: '2026-03-02T18:05:00.000Z',
  updatedAt: '2026-03-02T18:05:00.000Z',
  ...overrides,
});

const sportsDomain: DomainRecord = {
  id: 'dom_sports',
  type: 'sports',
  enabled: true,
  order: 1,
  settings: { targetPerWeek: 4 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const plan = (choice: 'gym' | 'running' | 'kept', sessions = [session()]) =>
  planLegacySportMigration({
    sessions,
    sportsDomain,
    choice,
    newId: (item) => `legacy-${item.id}`,
    now: '2026-09-07T12:00:00.000Z',
  });

describe('the choice itself', () => {
  it('has exactly three branches and no fourth that runs by itself', () => {
    expect(LEGACY_SPORT_CHOICES).toEqual(['gym', 'running', 'kept']);
  });

  it('is only asked when there is legacy data to ask about', () => {
    expect(needsLegacySportChoice('pending')).toBe(true);
    expect(needsLegacySportChoice('none')).toBe(false);
    expect(needsLegacySportChoice('gym')).toBe(false);
    // A record written before the field existed must never be read as "ask".
    expect(needsLegacySportChoice(undefined)).toBe(false);
  });
});

describe('converting to gym', () => {
  const result = plan('gym');

  it('carries every session, marked as carried over', () => {
    expect(result.gymSessions).toHaveLength(1);
    expect(result.gymSessions[0]?.legacyCarryOver).toBe(true);
    expect(result.runs).toHaveLength(0);
  });

  it('keeps the day, the week and the note the user actually recorded', () => {
    const carried = result.gymSessions[0]!;
    expect(carried.date).toBe('2026-03-02');
    expect(carried.weekKey).toBe('2026-W10');
    expect(carried.performedAt).toBe('2026-03-02T18:00:00.000Z');
    expect(carried.note).toBe('Abends');
  });

  it('invents no workout detail, because RC2 recorded none', () => {
    expect(result.gymSessions[0]?.planId).toBeNull();
  });

  it('moves the weekly target the user themselves set', () => {
    expect(result.inheritedTargetPerWeek).toBe(4);
    expect(result.retireSportsDomain).toBe(true);
  });
});

describe('converting to running', () => {
  it('invents no distance, elevation or step count', () => {
    // These are the numbers a plausible-looking conversion would fabricate.
    // RC2 never asked for any of them, so an honest absence is the only
    // truthful value.
    const run = plan('running').runs[0]!;
    expect(run.distanceMetres).toBeNull();
    expect(run.elevationMetres).toBeNull();
    expect(run.steps).toBeNull();
    expect(run.legacyCarryOver).toBe(true);
    expect(run.source).toBe('manual');
  });

  it('carries a duration only where the user entered one', () => {
    expect(plan('running').runs[0]?.durationSeconds).toBeNull();
    const timed = plan('running', [session({ durationMinutes: 45 })]);
    expect(timed.runs[0]?.durationSeconds).toBe(45 * 60);
  });
});

describe('keeping the legacy log as it stands', () => {
  const result = plan('kept');

  it('writes nothing and reinterprets nothing', () => {
    expect(result.gymSessions).toHaveLength(0);
    expect(result.runs).toHaveLength(0);
    expect(result.inheritedTargetPerWeek).toBeNull();
  });

  it('leaves the sports domain enabled, so its weeks keep their target', () => {
    expect(result.retireSportsDomain).toBe(false);
  });
});

describe('what conversion must never do', () => {
  it('never deletes the legacy sessions', () => {
    // Every day before the conversion resolves to a snapshot in which Sport
    // is the enabled weekly domain, and snapshots are never rewritten.
    // Deleting the rows those days refer to would turn a year of met targets
    // into a year of empty weeks.
    for (const choice of LEGACY_SPORT_CHOICES) {
      expect(Object.keys(plan(choice))).not.toContain('removeSportsSessionIds');
    }
  });

  it('produces the same records however many times it runs', () => {
    const first = plan('gym').gymSessions.map((item) => item.id);
    const second = plan('gym').gymSessions.map((item) => item.id);
    expect(first).toEqual(second);
  });
});
