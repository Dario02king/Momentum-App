import { describe, expect, it } from 'vitest';
import type { AppConfigSnapshot, DomainRecord } from '../model';
import {
  DOMAIN_DEFINITIONS,
  DOMAIN_TYPES,
  WEEKLY_DOMAIN_TYPES,
  activationOf,
  activationProblem,
  enabledDomainsIn,
  isLegacyDomain,
  legacySportEnabledIn,
  weeklyTargetsIn,
} from './index';

const domain = (
  type: DomainRecord['type'],
  enabled: boolean,
  settings: unknown = {},
): DomainRecord =>
  ({
    id: `dom_${type}`,
    type,
    enabled,
    order: 0,
    settings,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }) as DomainRecord;

const snapshot = (domains: AppConfigSnapshot['domains']): AppConfigSnapshot => ({
  domains,
  questions: [],
  scoring: { editWindowDays: 3, scaleMin: 1, scaleMax: 10 },
});

describe('the registry', () => {
  it('offers four domains and does not offer the retired one', () => {
    // A generic Sport rank no longer exists. Anything that enumerates live
    // domains goes through this list, so it cannot come back by accident.
    expect(DOMAIN_TYPES).toEqual(['mental', 'gym', 'running', 'food']);
    expect(DOMAIN_TYPES).not.toContain('sports');
    expect(isLegacyDomain('sports')).toBe(true);
  });

  it('defines every domain it offers', () => {
    for (const type of DOMAIN_TYPES) {
      expect(DOMAIN_DEFINITIONS[type].type).toBe(type);
    }
  });

  it('gives Gym and Running separate targets, never a shared one', () => {
    const gym = DOMAIN_DEFINITIONS.gym.defaultSettings.targetPerWeek;
    const running = DOMAIN_DEFINITIONS.running.defaultSettings.targetPerWeek;
    expect(gym).toBeGreaterThan(0);
    expect(running).toBeGreaterThan(0);
    expect(DOMAIN_DEFINITIONS.gym.hasWeeklyTarget).toBe(true);
    expect(DOMAIN_DEFINITIONS.running.hasWeeklyTarget).toBe(true);
    // Wellbeing and Food are judged daily; a weekly quota would be a
    // different product.
    expect(DOMAIN_DEFINITIONS.mental.hasWeeklyTarget).toBe(false);
    expect(DOMAIN_DEFINITIONS.food.hasWeeklyTarget).toBe(false);
  });

  it('still replays the retired domain, because its weeks were scored', () => {
    expect(WEEKLY_DOMAIN_TYPES).toContain('sports');
  });
});

describe('activation', () => {
  it('reports what is on, what is available and whether legacy Sport survives', () => {
    const activation = activationOf([
      domain('mental', true),
      domain('gym', false, { targetPerWeek: 3 }),
      domain('sports', true, { targetPerWeek: 4 }),
    ]);
    expect(activation.enabled).toEqual(['mental']);
    expect(activation.available).toEqual(['gym', 'running', 'food']);
    expect(activation.legacySportActive).toBe(true);
  });

  it('refuses to leave a user with nothing switched on', () => {
    expect(activationProblem([])).toBe('empty');
    expect(activationProblem(['food'])).toBeNull();
  });

  it('does not privilege Wellbeing — any one domain is enough', () => {
    expect(activationProblem(['gym'])).toBeNull();
  });
});

describe('what a past day was lived under', () => {
  it('reads the snapshot, not today', () => {
    const past = snapshot([
      { id: 'a', type: 'mental', enabled: true, settings: {} },
      { id: 'b', type: 'running', enabled: false, settings: { targetPerWeek: 2 } },
    ]);
    expect(enabledDomainsIn(past)).toEqual(['mental']);
    expect(legacySportEnabledIn(past)).toBe(false);
  });

  it('collects the weekly quotas that were actually in force', () => {
    const past = snapshot([
      { id: 'a', type: 'mental', enabled: true, settings: {} },
      { id: 'b', type: 'gym', enabled: true, settings: { targetPerWeek: 4 } },
      { id: 'c', type: 'running', enabled: true, settings: { targetPerWeek: 2 } },
    ]);
    expect(weeklyTargetsIn(past)).toEqual([
      { domain: 'gym', target: 4 },
      { domain: 'running', target: 2 },
    ]);
  });

  it('omits a disabled quota rather than reporting it as zero', () => {
    // A domain that was switched off asked for nothing, so nothing was
    // missed — a target of zero would score the week as a failure.
    const past = snapshot([
      { id: 'b', type: 'gym', enabled: false, settings: { targetPerWeek: 4 } },
    ]);
    expect(weeklyTargetsIn(past)).toEqual([]);
  });
});
