import { chromium } from 'playwright-core';
import { URL_APP, check, summary, phone, onboard } from './lib.mjs';

/**
 * Phase 6 through the accessibility tree.
 *
 * Food's rating is ten small numbered buttons — the shape that reads as "1 2
 * 3 4 5 6 7 8 9 10" and nothing else if the semantics are wrong. What is
 * checked is that it is one radio group with a real question as its label,
 * that each option says what it means rather than only what it is, that the
 * chosen value is announced, and that the logging sheet's fields are labelled.
 *
 * Real VoiceOver is **not** tested — there is no Apple hardware here. What is
 * verified is the layer VoiceOver consumes.
 */

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext(phone);
const page = await ctx.newPage();
await page.goto(URL_APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await onboard(page, { gym: 0, running: 0, food: true });

const cdp = await ctx.newCDPSession(page);
await cdp.send('Accessibility.enable');
async function tree() {
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const conv = (n) => ({
    role: n.role?.value,
    name: n.name?.value ?? '',
    description: n.description?.value ?? '',
    ignored: n.ignored,
    children: (n.childIds ?? []).map((id) => byId.get(id)).filter(Boolean).map(conv),
  });
  const flat = [];
  const walk = (n) => {
    if (!n.ignored && n.role && !['none', 'generic', 'InlineTextBox', 'StaticText'].includes(n.role)) {
      flat.push({ role: n.role, name: n.name, description: n.description });
    }
    n.children.forEach(walk);
  };
  walk(conv(nodes.find((n) => !n.parentId) ?? nodes[0]));
  return flat;
}

/* Chrome's accessibility tree calls role="img" an **image**, not an `img`. */
const IMAGE_ROLES = ['image', 'img'];
const unnamed = (nodes) =>
  nodes.filter(
    (n) =>
      ['button', 'textbox', 'radio', 'switch', 'link', 'combobox', ...IMAGE_ROLES].includes(n.role) &&
      !n.name.trim(),
  );

/* ── The rating, before anything is chosen ──────────────────────────────── */
{
  const nodes = await tree();
  check('nothing on the Food card is an unnamed control', unnamed(nodes).length === 0,
    unnamed(nodes).map((n) => `${n.role}`).join(', '));

  const group = nodes.find(
    (n) => n.role === 'radiogroup' && /entsprochen/.test(n.name),
  );
  check('the ten values are one radio group, not ten loose buttons', Boolean(group));
  check('and the group is labelled with the question itself',
    /Wie gut hast du heute deinem Vorsatz entsprochen/.test(group?.name ?? ''));

  /*
   * Scoped to the Food card. Wellbeing renders the same control for every
   * scale question it has, so counting radios page-wide counts theirs too.
   */
  const scoped = await page.evaluate(() => {
    const scale = document.querySelector('.food__scale');
    return [...(scale?.querySelectorAll('[role="radio"]') ?? [])].map((el) => ({
      name: el.getAttribute('aria-label') ?? '',
      tabIndex: el.tabIndex,
      checked: el.getAttribute('aria-checked') === 'true',
      text: el.textContent ?? '',
    }));
  });
  check('all ten values are exposed as radios', scoped.length === 10, String(scoped.length));
  check('and each says what it means, not only what it is',
    scoped.every((r) => /von 10 – (Schlecht|Mässig|Okay|Gut|Sehr gut)/.test(r.name)),
    scoped.map((r) => r.name).slice(0, 2).join(' | '));
  check('every one of them is also in the accessibility tree by that name',
    scoped.every((r) => nodes.some((n) => n.role === 'radio' && n.name === r.name)));
}

/* ── Keyboard: one tab stop, arrows within ──────────────────────────────── */
{
  await page.locator('.food__scale .answer-scale__value').first().focus();
  const tabbable = await page.evaluate(
    () =>
      [...document.querySelectorAll('.food__scale .answer-scale__value')].filter(
        (el) => el.tabIndex === 0,
      ).length,
  );
  check('the group is one tab stop, not ten', tabbable === 1, String(tabbable));

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const chosen = await page.evaluate(
    () =>
      document.querySelector('.food__scale .answer-scale__value[aria-checked="true"]')
        ?.textContent ?? '',
  );
  check('an arrow key moves and selects within the group', chosen === '2', chosen);
}

/* ── The chosen value is announced ──────────────────────────────────────── */
{
  await page.locator('.food__scale .answer-scale__value', { hasText: /^7$/ }).click();
  await page.waitForTimeout(600);

  const live = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-live]')].map((el) => el.textContent?.trim() ?? ''),
  );
  check('the rating is announced in a live region',
    live.some((text) => /7 von 10 · Gut/.test(text)), live.join(' | '));

  const nodes = await tree();
  const checked = await page.evaluate(() =>
    [...document.querySelectorAll('.food__scale [role="radio"][aria-checked="true"]')].map(
      (el) => el.getAttribute('aria-label') ?? '',
    ),
  );
  check('exactly one value is marked chosen, and it is the 7',
    checked.length === 1 && /^7 von 10/.test(checked[0] ?? ''), checked.join(' | '));
  check('the clear action is a named control, not an icon alone',
    nodes.some((n) => n.role === 'button' && /Bewertung entfernen/.test(n.name)));
}

/* ── The logging sheet ──────────────────────────────────────────────────── */
{
  await page.getByRole('button', { name: 'Essen eintragen' }).click();
  await page.waitForTimeout(500);

  const nodes = await tree();
  const dialog = nodes.find((n) => n.role === 'dialog');
  check('the sheet is a named dialog', Boolean(dialog) && /Essen eintragen/.test(dialog?.name ?? ''));

  const boxes = nodes.filter((n) => n.role === 'textbox' || n.role === 'spinbutton');
  check('every field in the sheet is labelled',
    boxes.length >= 3 && boxes.every((b) => b.name.trim().length > 0),
    boxes.map((b) => `${b.role}:${b.name}`).join(' | '));
  check('nothing in the sheet is an unnamed control', unnamed(nodes).length === 0,
    unnamed(nodes).map((n) => n.role).join(', '));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes the sheet', (await page.locator('.sheet').count()) === 0);
}

/* ── Removing an entry says which entry ─────────────────────────────────── */
{
  await page.getByRole('button', { name: 'Essen eintragen' }).click();
  await page.waitForTimeout(400);
  await page.locator('.sheet .row', { hasText: 'Banane' }).first().click();
  await page.waitForTimeout(600);

  const nodes = await tree();
  check('the remove control names the entry it removes, not just “remove”',
    nodes.some((n) => n.role === 'button' && /Eintrag entfernen: Banane/.test(n.name)));
}

/* ── Setup, in Areas ────────────────────────────────────────────────────── */
{
  await page.locator('.tab-bar__tab', { hasText: 'Bereiche' }).click();
  await page.waitForTimeout(600);
  const nodes = await tree();
  const field = nodes.find((n) => n.role === 'textbox' && /Vorsatz/.test(n.name));
  check('the setup field is labelled with what it is for', Boolean(field), field?.name ?? '');
  check('nothing in Areas is an unnamed control', unnamed(nodes).length === 0,
    unnamed(nodes).map((n) => n.role).join(', '));
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */
{
  const reduced = await ctx.newPage();
  await reduced.emulateMedia({ reducedMotion: 'reduce' });
  await reduced.goto(URL_APP, { waitUntil: 'networkidle' });
  await reduced.waitForTimeout(1200);
  /*
   * `global.css` collapses motion to 0.001ms rather than to zero — the
   * standard idiom, which keeps `transitionend` firing. So assert that
   * nothing runs a keyframe animation and no transition is long enough to
   * perceive, not that the computed duration is the string "0s".
   */
  const motion = await reduced.evaluate(() => {
    let keyframed = 0;
    let perceptible = 0;
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.001) keyframed += 1;
      if (s.transitionDuration.split(',').some((p) => parseFloat(p) > 0.001)) perceptible += 1;
    }
    return { keyframed, perceptible };
  });
  check('no animation runs under reduced motion', motion.keyframed === 0, String(motion.keyframed));
  check('and no transition is long enough to perceive', motion.perceptible === 0, String(motion.perceptible));
  await reduced.close();
}

await browser.close();
process.exit(summary() ? 0 : 1);
