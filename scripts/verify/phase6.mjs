import { chromium } from 'playwright-core';
import { URL_APP, check, summary, phone, onboard, clipped, smallTargets } from './lib.mjs';

/**
 * Phase 6: Food on the screen.
 *
 * The rating that Food is actually scored on, the log that it is not, the
 * setup that invents no target, and the one thing this phase must be able to
 * prove in a browser as well as in a unit test: what the user typed is what
 * comes back, and the screen never claims the calories produced the rank.
 */

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

/** Reads the food ratings straight out of IndexedDB. */
async function storedRatings(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('momentum');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (!db.objectStoreNames.contains('foodDays')) return null;
    return new Promise((res, rej) => {
      const r = db.transaction(['foodDays'], 'readonly').objectStore('foodDays').getAll();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  });
}

async function ready(viewport = {}, options = {}) {
  const ctx = await browser.newContext({ ...phone, ...viewport });
  const page = await ctx.newPage();
  await page.goto(URL_APP);
  await onboard(page, { gym: 0, running: 0, food: true, ...options });
  return { ctx, page };
}

/** The Food card's 1–10 picker on Today. */
const scaleValue = (page, value) =>
  page.locator('.answer-scale__value', { hasText: new RegExp(`^${value}$`) }).last();

/* ── The store exists, and only version 5 could have made it ────────────── */
{
  const { ctx, page } = await ready();
  const ratings = await storedRatings(page);
  check('the food ratings store exists on a fresh install', Array.isArray(ratings));
  check('and starts empty — nothing is seeded', (ratings ?? []).length === 0);
  await ctx.close();
}

/* ── Rating a day ───────────────────────────────────────────────────────── */
{
  const { ctx, page } = await ready();

  check('Ernährung has its own section on Today',
    await page.getByRole('heading', { name: 'Ernährung' }).first().isVisible());
  check('the day starts unrated, and says so',
    await page.getByText('Heute noch nicht bewertet').isVisible());

  await scaleValue(page, 8).click();
  await page.waitForTimeout(500);

  check('the rating reads back as the number tapped',
    /8 von 10/.test((await page.getByText(/von 10 ·/).first().textContent()) ?? ''));
  check('and it is spelled out in words, not only in colour',
    /8 von 10 · Gut/.test((await page.getByText(/von 10 ·/).first().textContent()) ?? ''));

  const stored = await storedRatings(page);
  check('exactly one row is stored for the day', stored.length === 1);
  check('and it stores the 1–10 the user chose, not a percentage',
    stored[0]?.adherence === 8);

  // Re-rating is a correction, never a second row.
  await scaleValue(page, 3).click();
  await page.waitForTimeout(500);
  const after = await storedRatings(page);
  check('re-rating the day replaces the rating', after.length === 1 && after[0]?.adherence === 3);
  check('and the screen follows it down',
    /3 von 10 · Schlecht/.test((await page.getByText(/von 10 ·/).first().textContent()) ?? ''));

  await page.getByRole('button', { name: 'Bewertung entfernen' }).click();
  await page.waitForTimeout(500);
  check('removing a rating returns the day to unrated',
    await page.getByText('Heute noch nicht bewertet').isVisible());
  check('and removes the row rather than storing a zero',
    (await storedRatings(page)).length === 0);
  await ctx.close();
}

/* ── The log, which is shown and never scored ───────────────────────────── */
{
  const { ctx, page } = await ready();

  check('the log starts empty', await page.getByText('Noch nichts eingetragen.').isVisible());
  check('the card says outright what is scored and what is not',
    await page.getByText(/Bewertet wird dein Vorsatz, nicht die Kalorien/).isVisible());

  await page.getByRole('button', { name: 'Essen eintragen' }).click();
  await page.waitForTimeout(300);
  check('the sheet offers a handful of suggestions',
    await page.getByRole('heading', { name: 'Vorschläge' }).isVisible());
  check('and a way to type anything else',
    await page.getByRole('heading', { name: 'Eigener Eintrag' }).isVisible());

  const rows = await page.locator('.sheet .row').count();
  check('there are between three and five suggestions, not a database',
    rows >= 3 && rows <= 5, `${rows} rows`);

  await page.locator('.sheet .row', { hasText: 'Haferflocken' }).first().click();
  await page.waitForTimeout(600);

  check('the entry lands on the day', await page.getByText('Haferflocken').first().isVisible());
  check('with its portion and energy',
    /60 g · 223 kcal/.test((await page.getByText(/60 g · /).first().textContent()) ?? ''));
  check('and the day carries a total',
    /223 kcal/.test((await page.locator('.food__total').textContent()) ?? ''));

  // The decisive one: a logged calorie total is not a rating.
  check('logging food does not rate the day',
    await page.getByText('Heute noch nicht bewertet').isVisible());
  check('and stores no rating either', (await storedRatings(page)).length === 0);

  // Something typed by hand.
  await page.getByRole('button', { name: 'Essen eintragen' }).click();
  await page.waitForTimeout(300);
  await page.locator('.food-sheet__input').first().fill('Kaffee');
  await page.locator('.food-sheet__input').nth(2).fill('5');
  await page.getByRole('button', { name: 'Eintragen', exact: true }).click();
  await page.waitForTimeout(600);
  check('a hand-typed entry is logged too', await page.getByText('Kaffee').first().isVisible());
  check('and the total follows it',
    /228 kcal/.test((await page.locator('.food__total').textContent()) ?? ''));

  await page.locator('.food__remove').first().click();
  await page.waitForTimeout(600);
  check('an entry can be removed', !(await page.getByText('Haferflocken').first().isVisible()));
  await ctx.close();
}

/* ── Setup: a sentence, and no invented target ──────────────────────────── */
{
  const { ctx, page } = await ready();
  await page.locator('.tab-bar__tab', { hasText: 'Bereiche' }).click();
  await page.waitForTimeout(400);

  check('Food setup asks for the user’s own aim',
    await page.getByText('Dein Vorsatz').first().isVisible());
  check('and says what it is for',
    await page.getByText(/nicht an einer Kalorienzahl/).isVisible());

  const body = (await page.locator('body').textContent()) ?? '';
  check('no calorie target is asked for anywhere in setup',
    !/Kalorienziel|Tagesbedarf|Grundumsatz|Zielgewicht|Makro/i.test(body));

  await page.locator('.food-focus__input').fill('Zmittag selber kochen');
  await page.getByRole('button', { name: 'Vorsatz sichern' }).click();
  await page.waitForTimeout(700);

  await page.locator('.tab-bar__tab', { hasText: 'Heute' }).click();
  await page.waitForTimeout(500);
  check('the aim is shown above the question it is rated against',
    await page.getByText('Zmittag selber kochen').isVisible());
  await ctx.close();
}

/* ── Food reaches the rank, and says so honestly ────────────────────────── */
{
  const { ctx, page } = await ready();
  await page.locator('.tab-bar__tab', { hasText: 'Rang' }).click();
  await page.waitForTimeout(600);
  const before = (await page.locator('body').textContent()) ?? '';
  check('Ernährung is listed as a Boss area', /Ernährung/.test(before));

  await page.locator('.tab-bar__tab', { hasText: 'Heute' }).click();
  await page.waitForTimeout(400);
  await scaleValue(page, 9).click();
  await page.waitForTimeout(700);

  await page.locator('.tab-bar__tab', { hasText: 'Rang' }).click();
  await page.waitForTimeout(700);
  const body = (await page.locator('body').textContent()) ?? '';
  check('and nothing on the rank screen talks about calories or macros',
    !/kcal|Kalorien|Makro/i.test(body));
  await ctx.close();
}

/* ── Four widths, and long German labels ────────────────────────────────── */
for (const width of [320, 360, 393, 430]) {
  const { ctx, page } = await ready({ viewport: { width, height: 800 } });
  await page.getByRole('button', { name: 'Essen eintragen' }).click();
  await page.waitForTimeout(300);
  await page.locator('.sheet .row', { hasText: 'Vollkornbrot' }).first().click();
  await page.waitForTimeout(600);
  await scaleValue(page, 10).click();
  await page.waitForTimeout(500);

  const clip = await clipped(page);
  check(`the Food card is not clipped at ${width}px`, clip.length === 0, clip.slice(0, 2).join('; '));
  const small = await smallTargets(page);
  check(`its targets hold at ${width}px`, small.length === 0, small.slice(0, 2).join('; '));
  const noScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  check(`the page does not scroll sideways at ${width}px`, noScroll);

  // And inside the sheet, which is where two number fields sit side by side.
  await page.getByRole('button', { name: 'Essen eintragen' }).click();
  await page.waitForTimeout(400);
  const sheetClip = await clipped(page);
  check(`the logging sheet is not clipped at ${width}px`, sheetClip.length === 0,
    sheetClip.slice(0, 2).join('; '));
  await ctx.close();
}

await browser.close();
process.exit(summary() ? 0 : 1);
