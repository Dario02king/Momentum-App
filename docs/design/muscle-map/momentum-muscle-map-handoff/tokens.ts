/**
 * Momentum muscle-map colour tokens — the approved values, verbatim.
 *
 * Two systems run side by side and must not be mixed:
 *
 *   IDENTITY  answers "which muscle is this?"   — fixed per group, state-independent
 *   STATE     answers "how did it go?"          — the five training states
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

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'core' | 'quadriceps' | 'hamstringsGlutes' | 'calves' | 'forearms';

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
  /** Full-saturation ink: percentage, badge text, 3D tint + emissive + rim. */
  ink: string;
  /** Badge background. */
  tint: string;
  /** 2D chart fill. */
  fill: string;
  /** 2D chart fill, emphasised. */
  strong: string;
  /** Hairline/border on tinted surfaces. */
  stroke: string;
}

export const STATE_COLOR: Readonly<Record<MuscleState, StateTokens>> = {
  improved:         { text: 'Verbessert',           ink: '#177a4c', tint: '#e4f6ec', fill: '#c6e6d3', strong: '#8fd0ae', stroke: 'rgba(21,128,78,0.26)' },
  declined:         { text: 'Zurückgegangen',       ink: '#bf394e', tint: '#fdecef', fill: '#f7d3d9', strong: '#eda8b3', stroke: 'rgba(191,57,78,0.24)' },
  unchanged:        { text: 'Gehalten',             ink: '#7a6410', tint: '#fdf3d4', fill: '#f4e4b2', strong: '#e9cf7d', stroke: 'rgba(122,100,16,0.24)' },
  awaitingBaseline: { text: 'Kein Vergleich',       ink: '#166db6', tint: '#e6f2fd', fill: '#d6e9fb', strong: '#a9d2f6', stroke: 'rgba(22,109,182,0.22)' },
  noData:           { text: 'Noch nicht trainiert', ink: '#8a8a95', tint: '#f2f2f6', fill: '#e9e9ef', strong: '#d6d6de', stroke: 'rgba(60,60,67,0.10)' },
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
 *   color    = lerp(BODY_BASE_COLOR, STATE_COLOR[state].ink, mix * intensity)
 *   emissive = STATE_COLOR[state].ink at emissiveIntensity * intensity
 *   rim      = STATE_COLOR[state].ink at rim * intensity   (Fresnel, pow 2.6)
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
