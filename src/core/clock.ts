import { todayKey } from './dates';
import type { DateKey } from './dates';

/**
 * A single, replaceable source of "now".
 *
 * Domain logic takes the current day as an argument wherever it can, but
 * repositories have to stamp records, and tests need those stamps to be
 * deterministic — so the one place time enters the app is here.
 */
export interface Clock {
  now(): Date;
}

const systemClock: Clock = { now: () => new Date() };

let clock: Clock = systemClock;

export function setClock(next: Clock | null): void {
  clock = next ?? systemClock;
}

export function now(): Date {
  return clock.now();
}

/** ISO instant, used for `createdAt` / `updatedAt` stamps. */
export function nowIso(): string {
  return clock.now().toISOString();
}

/** The current *local* calendar day. */
export function today(): DateKey {
  return todayKey(clock.now());
}
