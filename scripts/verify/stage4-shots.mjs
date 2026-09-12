import { chromium } from 'playwright-core';
import { URL_APP, check, onboard, phone, seedConfirmation, summary } from './lib.mjs';

/**
 * The promotion-confirmation indicator (D126) in its three states, on the
 * real Rank screen and the Today card, from the verify-only seed: 0/7 when
 * the threshold was reached today, 4/7 while a confirmation is pending, and
 * nothing while the rating sits below the next threshold with no days
 * collected. Screenshots at 393px go to docs/design/overall-rank.
 */
const OUT = process.env.OUT ?? 'docs/design/overall-rank';
const PRESETS = [
  { name: 'threshold', seed: { days: 28, value: 10, today: true }, expect: 'Rang bestätigen: 0/7 Tage' },
  { name: 'pending', seed: { days: 32, value: 10 }, expect: 'Rang bestätigen: 4/7 Tage' },
  { name: 'below', seed: { days: 28, value: 10 }, expect: null },
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [index, preset] of PRESETS.entries()) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(URL_APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await onboard(page, { gym: 0, running: 0 });
  await seedConfirmation(page, preset.seed);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const todayLine = (await page.locator('.boss-summary__confirm').allTextContents()).map((t) => t.trim());
  check(`${preset.name}: the Today card ${preset.expect ? `says "${preset.expect}"` : 'shows no indicator'}`,
    preset.expect ? todayLine.join('') === preset.expect : todayLine.length === 0, todayLine.join('|'));
  await page.screenshot({ path: `${OUT}/393-${'HIJ'[index]}-today-confirm-${preset.name}.png` });

  await page.locator('.tab-bar button', { hasText: 'Rang' }).click();
  await page.waitForTimeout(1400);
  const heroLine = (await page.locator('.rank-hero__confirm').allTextContents()).map((t) => t.trim());
  check(`${preset.name}: the Rank hero ${preset.expect ? `says "${preset.expect}"` : 'shows no indicator'}`,
    preset.expect ? heroLine.join('') === preset.expect : heroLine.length === 0, heroLine.join('|'));
  const bars = await page.locator('.rank-hero .rank-progress__track').count();
  check(`${preset.name}: the progress bar is still there, unchanged in number`, bars === 1, String(bars));
  await page.screenshot({ path: `${OUT}/393-${'KLM'[index]}-rang-confirm-${preset.name}.png` });
  await ctx.close();
}

await browser.close();
summary();
