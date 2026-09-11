import { chromium } from 'playwright-core';
import { URL_APP, check, summary, phone, onboard, seed, seedTraining } from './lib.mjs';

/**
 * The domain terminal, Stage A.
 *
 * What the architecture promises and this proves: one switch with proper
 * selected semantics, exactly one domain rendered at a time, Home untouched,
 * the global overview still reachable, the domain in the URL so a link can
 * name it, and Back walking the domains the user actually visited.
 */

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const ctx = await browser.newContext(phone);
const page = await ctx.newPage();
await page.goto(URL_APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await onboard(page, { gym: 3, running: 2, food: true });
await seed(page, { days: 42 });
await seedTraining(page, { days: 42 });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

/* ── Home stays global ─────────────────────────────────────────────────── */
check('Home still opens on Today', (await page.locator('.screen__title').textContent())?.trim() === 'Heute');
check('Home still carries the Boss standing', await page.locator('.boss-summary').isVisible());
check('Home still carries the daily check-in', (await page.locator('.check-in').count()) > 0);
check('Home still carries the Ernährung rating', await page.locator('.food__scale').isVisible());
check('Home still carries the training actions',
  await page.getByRole('button', { name: 'Session eintragen' }).isVisible() &&
  await page.getByRole('button', { name: 'Lauf eintragen' }).isVisible());
check('Home carries no domain terminal content',
  (await page.locator('[data-metric]').count()) === 0 && (await page.locator('.domain-switch').count()) === 0);
check('Home is addressed as #/today', await page.evaluate(() => location.hash) === '#/today');

/* ── The switch ────────────────────────────────────────────────────────── */
await page.getByRole('button', { name: 'Verlauf' }).click();
await page.waitForTimeout(1200);
const group = page.getByRole('radiogroup', { name: 'Bereich wählen' });
check('the switch is a named radio group', await group.isVisible());
const radios = await group.getByRole('radio').allTextContents();
check('it offers the four enabled areas in product order',
  JSON.stringify(radios.map((s) => s.trim())) === JSON.stringify(['Wellbeing', 'Gym', 'Laufen', 'Ernährung']), radios.join(' | '));
check('exactly one area is checked',
  (await group.locator('[aria-checked="true"]').count()) === 1);
check('it opens on the first area', (await group.locator('[aria-checked="true"]').textContent())?.trim() === 'Wellbeing');
check('the switch is one tab stop', (await group.locator('[tabindex="0"]').count()) === 1 && (await group.locator('[tabindex="-1"]').count()) === 3);
const switchBox = await group.boundingBox();
check('the switch sits on one line at 393px', switchBox !== null && switchBox.height < 60, String(switchBox?.height));
const labelsClipped = await group.getByRole('radio').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
check('no switch label is clipped', labelsClipped === 0, String(labelsClipped));

/* ── One domain at a time ──────────────────────────────────────────────── */
const metricsOn = async () => page.locator('[data-metric]').evaluateAll((els) => els.map((el) => el.getAttribute('data-metric')));
let metrics = await metricsOn();
check('Wellbeing shows only Wellbeing', metrics.every((m) => m.startsWith('mental')) && metrics.length > 0, metrics.join(','));
check('the Wellbeing daily row is shown, and no other domain row',
  await page.locator('.heatmap__label', { hasText: 'Wellbeing' }).first().isVisible() &&
  (await page.locator('.heatmap__label', { hasText: /^Gym$|^Laufen$|^Ernährung$|^Gesamt$/ }).count()) === 0);

await group.getByRole('radio', { name: 'Gym' }).click();
await page.waitForTimeout(900);
metrics = await metricsOn();
check('Gym shows only Gym', metrics.length > 0 && metrics.every((m) => m.startsWith('gym')), metrics.join(','));
check('switching needs no reload and keeps the range', await page.getByRole('button', { name: '30 Tage' }).getAttribute('aria-pressed') === 'true');
check('the URL names the domain', await page.evaluate(() => location.hash) === '#/progress/gym');

await group.getByRole('radio', { name: 'Laufen' }).click();
await page.waitForTimeout(900);
metrics = await metricsOn();
check('Laufen shows only Laufen', metrics.length > 0 && metrics.every((m) => m.startsWith('running')), metrics.join(','));

await group.getByRole('radio', { name: 'Ernährung' }).click();
await page.waitForTimeout(900);
metrics = await metricsOn();
check('Ernährung shows only Ernährung', metrics.length > 0 && metrics.every((m) => m.startsWith('food')), metrics.join(','));
check('the Ernährung daily row is the domain\'s own',
  await page.locator('.heatmap__label', { hasText: 'Ernährung' }).first().isVisible());

/* ── Keyboard ──────────────────────────────────────────────────────────── */
await group.locator('[aria-checked="true"]').focus();
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(700);
check('arrow keys move the selection', (await group.locator('[aria-checked="true"]').textContent())?.trim() === 'Laufen');

/* ── Back walks the domains visited ────────────────────────────────────── */
await page.goBack();
await page.waitForTimeout(800);
check('Back returns to the previous domain',
  await page.evaluate(() => location.hash) === '#/progress/food' &&
  (await group.locator('[aria-checked="true"]').textContent())?.trim() === 'Ernährung');
await page.goBack();
await page.waitForTimeout(800);
check('and again', await page.evaluate(() => location.hash) === '#/progress/running');
await page.goForward();
await page.waitForTimeout(800);
check('Forward re-enters it', await page.evaluate(() => location.hash) === '#/progress/food');

/* ── A deep link names a domain ────────────────────────────────────────── */
await page.goto(`${URL_APP}#/progress/gym`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('a link to #/progress/gym opens Verlauf on Gym',
  (await page.locator('.screen__title').textContent())?.trim() === 'Verlauf' &&
  (await page.getByRole('radiogroup').locator('[aria-checked="true"]').textContent())?.trim() === 'Gym');
await page.goto(`${URL_APP}#/rank`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('a link to #/rank opens Rang', (await page.locator('.screen__title').textContent())?.trim() === 'Rang');
check('the global trend lives on Rang now', await page.getByText('Trend', { exact: true }).first().isVisible());
check('and the overall daily row with it', await page.locator('.heatmap__label', { hasText: 'Gesamt' }).first().isVisible());
await page.goto(`${URL_APP}#/nowhere`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
check('an unknown hash reached in-page keeps the screen and corrects the address',
  (await page.locator('.screen__title').textContent())?.trim() === 'Rang' &&
  await page.evaluate(() => location.hash) === '#/rank');
const fresh = await ctx.newPage();
await fresh.goto(`${URL_APP}#/nowhere`, { waitUntil: 'networkidle' });
await fresh.waitForTimeout(1500);
check('and a fresh load of an unknown hash lands on Today, with the address corrected',
  (await fresh.locator('.screen__title').textContent())?.trim() === 'Heute' &&
  await fresh.evaluate(() => location.hash) === '#/today');
await fresh.close();

/* ── A domain switched off ─────────────────────────────────────────────── */
await page.goto(`${URL_APP}#/areas`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.locator('.areas__domainHeader', { hasText: 'Laufen' }).getByRole('switch').click();
await page.waitForTimeout(900);
await page.goto(`${URL_APP}#/progress/running`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
check('a link to a switched-off domain is corrected to the first enabled one',
  await page.evaluate(() => location.hash) === '#/progress/mental' &&
  (await page.getByRole('radiogroup').getByRole('radio').count()) === 3);

/* ── Reduced motion ────────────────────────────────────────────────────── */
const reduced = await ctx.newPage();
await reduced.emulateMedia({ reducedMotion: 'reduce' });
await reduced.goto(`${URL_APP}#/progress/gym`, { waitUntil: 'networkidle' });
await reduced.waitForTimeout(1500);
const motion = await reduced.evaluate(() => {
  let keyframed = 0, perceptible = 0;
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.01) keyframed += 1;
    for (const d of s.transitionDuration.split(',')) if (parseFloat(d) > 0.05) perceptible += 1;
  }
  return { keyframed, perceptible };
});
check('no animation runs under reduced motion on the terminal', motion.keyframed === 0, String(motion.keyframed));
check('and no transition is long enough to perceive', motion.perceptible === 0, String(motion.perceptible));

await browser.close();
process.exit(summary() ? 0 : 1);
