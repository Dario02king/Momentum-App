import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STATUS_IDS } from '../core/config/constants';
import { STATUS_KEYS, STATUS_PALETTE, cssToken } from './statusPalette';

/**
 * One definition of the status colours (D123).
 *
 * `tokens.css` is the source; this module is the bridge TypeScript reads it
 * through. The first suite checks the bridge against the file it claims to
 * read, the second walks the source tree so a second literal cannot appear
 * anywhere without failing here.
 */

const TOKENS_CSS = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const SRC = fileURLToPath(new URL('..', import.meta.url));

function declared(name: string): string {
  const match = TOKENS_CSS.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, 'i'));
  if (!match) throw new Error(`${name} is not a plain hex in tokens.css`);
  return match[1]!.toLowerCase();
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx|css|js|mjs|html)$/.test(entry)) out.push(path);
  }
  return out;
}

describe('the status palette bridge', () => {
  it('reads exactly the fills tokens.css declares', () => {
    for (const id of STATUS_IDS) {
      expect(STATUS_PALETTE[id].fill).toBe(declared(`--status-${id}`));
    }
    expect(STATUS_PALETTE.empty.fill).toBe(declared('--status-empty'));
  });

  it('reads the ink and tint of every status, following aliases', () => {
    for (const key of STATUS_KEYS) {
      expect(STATUS_PALETTE[key].ink).toMatch(/^#[0-9a-f]{6}$/);
      expect(STATUS_PALETTE[key].tint).toMatch(/^#[0-9a-f]{6}$/);
      expect(STATUS_PALETTE[key].on).toMatch(/^#[0-9a-f]{6}$/);
    }
    // `--status-empty-ink` is `var(--text-secondary)`: the alias resolves.
    expect(STATUS_PALETTE.empty.ink).toBe(declared('--text-secondary'));
    expect(STATUS_PALETTE.weak.on).toBe(declared('--text-primary'));
  });

  it('refuses a token that is not there, rather than returning nothing', () => {
    expect(() => cssToken('--status-nonexistent')).toThrow(/does not define/);
    expect(() => cssToken('--duration-fast')).toThrow(/not a plain hex/);
  });

  it('is frozen: nothing can repaint a status at runtime', () => {
    expect(Object.isFrozen(STATUS_PALETTE)).toBe(true);
    expect(Object.isFrozen(STATUS_PALETTE.weak)).toBe(true);
  });
});

describe('the status colours are written once', () => {
  const fills = [...STATUS_IDS, 'empty' as const].map((key) => STATUS_PALETTE[key].fill);

  it.each(fills)('%s appears in tokens.css and nowhere else under src/', (fill) => {
    const pattern = new RegExp(fill.replace('#', '#'), 'i');
    const carriers = sourceFiles(SRC)
      .filter((path) => pattern.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SRC.length));
    expect(carriers).toEqual(['styles/tokens.css']);
  });
});
