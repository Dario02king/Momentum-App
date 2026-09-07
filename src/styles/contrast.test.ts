import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The design tokens are checked, not trusted.
 *
 * Every colour claim in the palette — "this one is safe for text", "this one
 * is only for fills" — is an accessibility promise, and a promise nobody
 * verifies is a promise that quietly breaks the first time a colour is
 * nudged. This suite reads the real token file and does the arithmetic.
 */

const CSS = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

function tokens(): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of CSS.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    found.set(match[1]!, match[2]!.trim());
  }
  // Resolve `var(--x)` aliases so a token defined by reference is checked too.
  for (const [name, value] of found) {
    let resolved = value;
    for (let depth = 0; depth < 4 && resolved.startsWith('var('); depth += 1) {
      const target = resolved.slice(4, resolved.indexOf(')'));
      resolved = found.get(target) ?? resolved;
    }
    found.set(name, resolved);
  }
  return found;
}

const TOKENS = tokens();

function hex(name: string): string {
  const value = TOKENS.get(name);
  if (!value) throw new Error(`Token ${name} is not defined`);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Token ${name} is not a plain hex: ${value}`);
  return value;
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const r = channel(parseInt(color.slice(1, 3), 16));
  const g = channel(parseInt(color.slice(3, 5), 16));
  const b = channel(parseInt(color.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const WHITE = '#ffffff';

/** WCAG AA: 4.5:1 for body text, 3:1 for large text and graphical objects. */
const BODY = 4.5;
const LARGE = 3;

describe('text on white', () => {
  it.each(['--text-primary', '--text-secondary', '--accent'])('%s is readable', (name) => {
    expect(contrast(hex(name), WHITE)).toBeGreaterThanOrEqual(BODY);
  });

  it.each([
    '--lilac-ink',
    '--mint-ink',
    '--sky-ink',
    '--peach-ink',
    '--rose-ink',
    '--sand-ink',
  ])('%s is safe for text, which is what "ink" promises', (name) => {
    expect(contrast(hex(name), WHITE)).toBeGreaterThanOrEqual(BODY);
  });
});

describe('ink on its own tint', () => {
  it.each([
    ['--lilac-ink', '--lilac-tint'],
    ['--mint-ink', '--mint-tint'],
    ['--sky-ink', '--sky-tint'],
    ['--peach-ink', '--peach-tint'],
    ['--rose-ink', '--rose-tint'],
    ['--sand-ink', '--sand-tint'],
    // The tinted secondary button.
    ['--accent-ink', '--accent-tint'],
  ])('%s reads on %s', (ink, tint) => {
    // Badges pair an ink with its own tint; both halves have to work.
    expect(contrast(hex(ink), hex(tint))).toBeGreaterThanOrEqual(BODY);
  });
});

describe('white on a filled control', () => {
  it.each(['--accent', '--accent-pressed', '--lilac-ink', '--mint-ink'])(
    'white label reads on %s',
    (name) => {
      expect(contrast(WHITE, hex(name))).toBeGreaterThanOrEqual(BODY);
    },
  );

  it.each(['--lilac-mid', '--mint-mid'])(
    '%s carries a graphical control, not body text',
    (name) => {
      // The `-mid` weights are switches and display type, never 17px labels.
      expect(contrast(WHITE, hex(name))).toBeGreaterThanOrEqual(LARGE);
    },
  );
});

describe('history grid bands', () => {
  it.each(['--band-low', '--band-fair', '--band-good', '--band-high'])(
    '%s separates from the empty cell track',
    (name) => {
      // A filled bar is a graphical object: 3:1 against what surrounds it.
      expect(contrast(hex(name), hex('--band-track'))).toBeGreaterThanOrEqual(LARGE);
    },
  );

  it('leaves the no-data track lighter than every band', () => {
    // An empty cell must never be mistaken for a low score.
    const bands = ['--band-low', '--band-fair', '--band-good', '--band-high'].map((name) =>
      luminance(hex(name)),
    );
    expect(Math.min(...bands)).toBeLessThan(luminance(hex('--band-none')));
  });
});

/**
 * The fixed 1–10 mapping.
 *
 * Red, orange, yellow, green, dark green is a product decision about *hue*.
 * Everything below is the accessibility half of it, which the decision does
 * not settle and which cannot be checked by eye.
 */
describe('the 1-10 semantic bands', () => {
  const BANDS = ['poor', 'fair', 'okay', 'good', 'veryGood'];

  it.each(BANDS)('--scale-%s-ink is safe for text on white', (band) => {
    expect(contrast(hex(`--scale-${band}-ink`), WHITE)).toBeGreaterThanOrEqual(BODY);
  });

  it.each(BANDS)('--scale-%s-ink reads on its own tint', (band) => {
    expect(
      contrast(hex(`--scale-${band}-ink`), hex(`--scale-${band}-tint`)),
    ).toBeGreaterThanOrEqual(BODY);
  });

  it.each(BANDS)('--scale-%s-on reads on the band fill', (band) => {
    // The number inside a selected bubble is the value itself. If it does not
    // read, the control has no content.
    expect(
      contrast(hex(`--scale-${band}-on`), hex(`--scale-${band}-fill`)),
    ).toBeGreaterThanOrEqual(BODY);
  });

  it.each(BANDS)('--scale-%s-ink outlines the fill against a card', (band) => {
    // A yellow fill cannot clear 3:1 on white, so the outline is what makes
    // the control a graphical object. It has to clear it on every band.
    expect(contrast(hex(`--scale-${band}-ink`), WHITE)).toBeGreaterThanOrEqual(LARGE);
  });

  it('separates green from dark green by luminance, not only by hue', () => {
    // 8 and 9 are one step apart on the scale and one hue apart in the
    // palette. Without a luminance gap they are the same colour to a
    // deuteranope, and the ramp would lose its top half.
    expect(
      contrast(hex('--scale-good-fill'), hex('--scale-veryGood-fill')),
    ).toBeGreaterThanOrEqual(1.5);
  });

  it('darkens as the band improves, so the ramp has a direction', () => {
    const dark = ['--scale-good-fill', '--scale-veryGood-fill'].map((name) =>
      luminance(hex(name)),
    );
    expect(dark[1]!).toBeLessThan(dark[0]!);
  });
});

describe('surfaces', () => {
  it('separates the ground from a card', () => {
    // Subtle, but it has to be an actual difference — the card is what makes
    // the light theme legible as layers rather than one flat sheet.
    expect(luminance(hex('--surface-elevated'))).toBeGreaterThan(luminance(hex('--surface-base')));
  });
});
