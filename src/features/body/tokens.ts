/**
 * Momentum muscle-map colour tokens — the approved values, verbatim.
 *
 * Two systems run side by side and must not be mixed:
 *
 *   IDENTITY  answers "which muscle is this?"   — fixed per group, state-independent
 *   STATE     answers "how did it go?"          — the five training states,
 *             coloured by the app's one status palette (D123): improved is
 *             `strong`, declined is `weak`, unchanged is `mixed`, noData is
 *             `empty`, and awaitingBaseline keeps the informational blue.
 *
 * Identity is used for: the row swatch/dot, the row sparkline, the dot next to
 * the name in the detail card, and any legend that lists GROUPS.
 * State is used for: the tinted regions on the 3D model (colour + emissive +
 * rim), the percentage in the row, the status badge, the percentage in the
 * detail card, and any legend that lists STATES.
 *
 * Identity is rendered ~13 % desaturated (see mutedIdentity) so it never
 * competes with the fully saturated state colours. State colours ship at full
 * saturation and must not be muted.
 */

import type { MuscleGroup } from '../../core/model';
import { STATUS_PALETTE, cssToken } from '../../styles/statusPalette';

export type MuscleState =
  | 'improved'          // Verbessert
  | 'declined'          // Zurückgegangen
  | 'unchanged'         // Gehalten
  | 'awaitingBaseline'  // Kein Vergleich
  | 'noData';           // Noch nicht trainiert

/* ── A. identity ───────────────────────────────────────────────────────── */

/** Base identity hue per group. Never derived from state. */
export const IDENTITY_COLOR: Readonly<Record<MuscleGroup, string>> = {
  chest:            '#D9654E',  // Terracotta
  back:             '#2E6FB7',  // Stahlblau
  shoulders:        '#E8A33D',  // Amber
  biceps:           '#7B5AC9',  // Violett
  triceps:          '#C45D9E',  // Magenta
  core:             '#C9A227',  // Ocker
  quadriceps:       '#1F9E94',  // Teal
  hamstringsGlutes: '#8C6239',  // Bronze
  calves:           '#4FB3E8',  // Himmelblau
  forearms:         '#6E7B8B',  // Schiefer
};

/** How far identity colours are pulled toward their own luminance. */
export const IDENTITY_DESATURATION = 0.13;

/** Opacity for an untrained group's swatch — present, but clearly inactive. */
export const IDENTITY_UNTRAINED_ALPHA = 0.35;

/** Alpha of the selection ring drawn around the row swatch. */
export const IDENTITY_SELECTION_RING_ALPHA = 0.22;

/** The exact function the approved design uses. Returns an rgb()/rgba() string. */
export function mutedIdentity(hex: string, alpha = 1): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (c: number) => Math.round(c + (grey - c) * IDENTITY_DESATURATION);
  return alpha >= 1
    ? `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
    : `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, ${alpha})`;
}

/* ── B. state ──────────────────────────────────────────────────────────── */

export interface StateTokens {
  /** German label used by the badge and the legend. */
  text: string;
  /** Text-safe: the percentage, the badge text, the row figure. */
  ink: string;
  /** Badge background. */
  tint: string;
  /** What the 3D region is tinted with: colour + emissive + rim. */
  model: string;
}

/**
 * Nothing here is a literal. The three status states read the status
 * palette, which is parsed out of `tokens.css`; the informational blue is
 * the same `--sky-*` pair the 2D renderer and the muscle rows use. The 3D
 * region takes the status colour itself — the signal, not its text ink —
 * so the body and the legend swatch next to it are the same colour.
 */
const SKY_INK = cssToken('--sky-ink');

export const STATE_COLOR: Readonly<Record<MuscleState, StateTokens>> = {
  improved:         { text: 'Verbessert',           ink: STATUS_PALETTE.strong.ink, tint: STATUS_PALETTE.strong.tint, model: STATUS_PALETTE.strong.fill },
  declined:         { text: 'Zurückgegangen',       ink: STATUS_PALETTE.weak.ink,   tint: STATUS_PALETTE.weak.tint,   model: STATUS_PALETTE.weak.fill },
  unchanged:        { text: 'Gehalten',             ink: STATUS_PALETTE.mixed.ink,  tint: STATUS_PALETTE.mixed.tint,  model: STATUS_PALETTE.mixed.fill },
  awaitingBaseline: { text: 'Kein Vergleich',       ink: SKY_INK,                   tint: cssToken('--sky-tint'),     model: SKY_INK },
  noData:           { text: 'Noch nicht trainiert', ink: STATUS_PALETTE.empty.ink,  tint: STATUS_PALETTE.empty.tint,  model: STATUS_PALETTE.empty.fill },
};

/* ── C. 3D material + selection treatment ─────────────────────────────── */

/** Untinted body grey. Also the colour of the inert `none` region. */
export const BODY_BASE_COLOR = '#c9c9d2';

/** Highlight used when tinting is off (data-tint="off") and a group is selected. */
export const NEUTRAL_HIGHLIGHT = '#5e5ce6';

/**
 * Region material mix. `intensity` (0…1) comes from the host and carries the
 * MAGNITUDE of the change, so +12 % burns brighter than +2 %.
 *
 *   color    = lerp(BODY_BASE_COLOR, STATE_COLOR[state].model, mix * intensity)
 *   emissive = STATE_COLOR[state].model at emissiveIntensity * intensity
 *   rim      = STATE_COLOR[state].model at rim * intensity   (Fresnel, pow 2.6)
 */
export const REGION_MATERIAL = {
  roughness: 0.74,
  metalness: 0,
  resting:  { mix: 0.55, emissiveIntensity: 0.11, rim: 0.42 },
  selected: { mix: 0.72, emissiveIntensity: 0.26, rim: 0.95 },
  /** Exponential ease rate; 1 - exp(-dt * rate) settles in ~250 ms. */
  easeRate: 12,
} as const;

/** The intensity curve the approved design uses. */
export function stateIntensity(state: MuscleState, deltaPercent: number): number {
  if (state === 'noData') return 0;                  // stays base grey
  if (state === 'awaitingBaseline') return 0.42;
  if (state === 'unchanged') return 0.4;
  const pct = Math.abs(deltaPercent);
  return Math.max(0.34, Math.min(1, 0.34 + (pct / 12) * 0.66));
}
