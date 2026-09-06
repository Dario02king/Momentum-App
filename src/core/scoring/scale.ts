import { SCALE_BANDS, SCALE_MAX, SCALE_MIN, type ScaleBandId } from '../config/constants';

/**
 * Scale answers (1–10) and their qualitative reading.
 *
 * The number alone is not an answer: "7" means nothing until it reads as
 * "Gut". Colour, label and summary all resolve through this one function, so
 * they can never drift apart.
 */

export function clampScaleValue(value: number): number {
  if (Number.isNaN(value)) return SCALE_MIN;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
}

export function isValidScaleValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= SCALE_MIN && value <= SCALE_MAX;
}

/** Bands are `from` inclusive and `to` exclusive; the top band includes 10. */
export function scaleBandOf(value: number): ScaleBandId {
  const clamped = clampScaleValue(value);
  for (const band of SCALE_BANDS) {
    if (clamped >= band.from && clamped < band.to) return band.id;
  }
  return SCALE_BANDS[SCALE_BANDS.length - 1]!.id;
}

/** A scale answer contributes its value × 10 as a percentage (§8). */
export function scaleValueToPercent(value: number): number {
  return clampScaleValue(value) * 10;
}

export const SCALE_BAND_LABEL_KEYS = {
  poor: 'scale.poor',
  okay: 'scale.okay',
  good: 'scale.good',
  veryGood: 'scale.veryGood',
} as const satisfies Record<ScaleBandId, string>;

/** Every value the picker offers, low to high. */
export const SCALE_VALUES: number[] = Array.from(
  { length: SCALE_MAX - SCALE_MIN + 1 },
  (_, index) => SCALE_MIN + index,
);
