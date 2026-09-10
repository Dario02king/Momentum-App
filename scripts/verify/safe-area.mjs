import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { URL_APP, check, summary, phone, onboard, seed } from './lib.mjs';

/**
 * Responsive layout and iOS safe-area correction pass.
 *
 * Three things are proved here and one is deliberately not.
 *
 * Proved: no route overflows horizontally, no text is cut off vertically,
 * and the safe-area insets are spent exactly once — by the screen primitive
 * and by the tab bar, never a second time by something inside them. The
 * insets are simulated by overriding the tokens the app already reads,
 * because a desktop browser reports zero for every `env(safe-area-inset-*)`.
 *
 * Not proved, and not provable here: what iOS paints above the web view in
 * standalone mode. `apple-mobile-web-app-status-bar-style` has no effect in
 * any browser that is not Safari on a home-screen install, so the status bar
 * is a device check and is reported as one.
 */

const ARTIFACTS = new URL('../../.artifacts/', import.meta.url).pathname;
mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

/** iPhone 14 Pro and 14 Pro Max, the two the brief names, plus the narrow ends. */
const SIZES = [
  { name: '393x852', width: 393, height: 852, primary: true },
  { name: '430x932', width: 430, height: 932, primary: true },
  { name: '320x568', width: 320, height: 568, primary: false },
  { name: '360x800', width: 360, height: 800, primary: false },
];

/** What a notched iPhone actually reports, injected as the app's own tokens. */
const INSETS = ':root{--safe-top:59px;--safe-bottom:34px;--safe-left:0px;--safe-right:0px;}';

/** A German compound long enough that no line box can break it at a space. */
const LONG_WORD = 'Grundstücksverkehrsgenehmigung';
const LONG_TEXT = `Wie zufrieden warst du heute mit deiner ${LONG_WORD} insgesamt?`;

const TABS = ['Heute', 'Verlauf', 'Rang', 'Bereiche'];

/** Everything a route can get wrong, measured in one pass in the page. */
const inspect = (longText) => {
  /*
   * Only the elements that genuinely carry text the user wrote. Stressing a
   * fixed catalogue string proves nothing about the product and would argue
   * for restyling type that no real copy can reach: the four tab titles in
   * `.screen__title`, the empty-state copy and the section labels all come
   * from the German catalogue, whose longest words are ordinary ones.
   */
  if (longText) {
    for (const sel of ['.row__title', '.check-in__prompt', '.question-detail__title', '.gym-detail__title']) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.children.length === 0) el.textContent = longText;
      }
    }
  }
  const docW = document.documentElement.clientWidth;
  const name = (el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ').join('.') : ''}`;

  /* An element clipped to a 1px box is a screen-reader label, not layout: it
     is absolutely positioned, clipped away and cannot scroll anything. */
  const laidOut = (el) => el.clientWidth > 1 && el.clientHeight > 1;

  const overflow = [...document.querySelectorAll('*')]
    .filter((el) => laidOut(el) && el.scrollWidth > docW + 1)
    .map((el) => `${name(el)} ${el.scrollWidth}>${docW}`);

  const clipped = [...document.querySelectorAll('h1,h2,h3,p,span,li,label,button')]
    .filter((el) => laidOut(el) && el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflow !== 'visible')
    .map((el) => `${name(el)} ${el.scrollHeight}>${el.clientHeight}`);

  const scroller = document.querySelector('[class$="__scroll"]');
  const tab = document.querySelector('.tab-bar');
  const header = document.querySelector('.screen__header');
  const card = document.querySelector('.card');
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const r = { scroller: box(scroller), tab: box(tab), header: box(header), card: box(card) };

  return {
    overflow: [...new Set(overflow)].slice(0, 8),
    clipped: [...new Set(clipped)].slice(0, 8),
    headerTop: r.header ? Math.round(r.header.top) : null,
    headerPadTop: header ? getComputedStyle(header).paddingTop : null,
    cardLeft: r.card ? Math.round(r.card.left) : null,
    cardWidth: r.card ? Math.round(r.card.width) : null,
    scrollerBottom: r.scroller ? Math.round(r.scroller.bottom) : null,
    scrollerPadBottom: scroller ? getComputedStyle(scroller).paddingBottom : null,
    tabTop: r.tab ? Math.round(r.tab.top) : null,
    tabBottom: r.tab ? Math.round(r.tab.bottom) : null,
    /* The last thing in the list must clear the bottom edge on its own. */
    tailGap: (() => {
      if (!scroller) return null;
      const kids = [...scroller.children];
      const last = kids[kids.length - 1];
      if (!last) return null;
      scroller.scrollTop = scroller.scrollHeight;
      return Math.round(scroller.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom);
    })(),
  };
};

async function open(size, { insets }) {
  const ctx = await browser.newContext({
    ...phone,
    viewport: { width: size.width, height: size.height },
  });
  const page = await ctx.newPage();
  await page.goto(URL_APP);
  await onboard(page, { gym: 3, running: 2, food: true, wellbeing: true });
  if (insets) await page.addStyleTag({ content: INSETS });
  return { ctx, page };
}

async function goTo(page, tab) {
  if (tab === 'Heute') return;
  await page.getByRole('button', { name: new RegExp(`^${tab}$`) }).first().click();
  await page.waitForTimeout(350);
}

/* --- routes, at every size, with and without insets, plain and stressed --- */

const measurements = [];

for (const size of SIZES) {
  for (const insets of [false, true]) {
    for (const longText of [false, true]) {
      const { ctx, page } = await open(size, { insets });
      for (const tab of TABS) {
        await goTo(page, tab);
        const r = await page.evaluate(
          `(${inspect.toString()})(${longText ? JSON.stringify(LONG_TEXT) : 'null'})`,
        );
        const label = `${size.name} ${insets ? 'insets' : 'flat  '} ${longText ? 'long' : 'copy'} ${tab}`;
        check(`no horizontal overflow — ${label}`, r.overflow.length === 0, r.overflow.join(' | '));
        check(`no clipped text — ${label}`, r.clipped.length === 0, r.clipped.join(' | '));
        if (insets && !longText) {
          check(
            `list clears the bottom edge — ${label}`,
            r.tailGap !== null && r.tailGap >= 24 && r.scrollerBottom <= r.tabTop,
            `tail gap ${r.tailGap}px, scroller ends ${r.scrollerBottom}, tab bar starts ${r.tabTop}`,
          );
          if (size.primary) {
            measurements.push({ size: size.name, tab, ...r, overflow: undefined, clipped: undefined });
            await page.screenshot({ path: join(ARTIFACTS, `${size.name}-${tab}.png`) });
          }
        }
      }
      await ctx.close();
    }
  }
}

/* --- the one reachable overflow defect, driven end to end --- */

for (const size of SIZES.filter((s) => s.primary || s.width === 320)) {
  const { ctx, page } = await open(size, { insets: true });
  await goTo(page, 'Bereiche');
  await page.getByRole('button', { name: 'Frage hinzufügen' }).first().click();
  await page.locator('#question-text').fill(LONG_TEXT);
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
  await page.waitForTimeout(500);
  /* Verlauf shows closed days, and a fresh install has none — so the question
     needs a history behind it before its detail screen can be reached. */
  await seed(page, { days: 30 });
  await page.reload();
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: INSETS });
  await goTo(page, 'Verlauf');
  // The questions sit under the Wellbeing group, which opens on tap.
  await page.getByRole('button', { name: /Wellbeing/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: new RegExp(LONG_WORD) }).first().click();
  await page.waitForTimeout(400);
  const r = await page.evaluate(`(${inspect.toString()})(null)`);
  const title = await page.locator('.question-detail__title').first().boundingBox();
  check(
    `question detail wraps a ${LONG_WORD.length}-character compound — ${size.name}`,
    r.overflow.length === 0 && title.width <= size.width,
    `title ${Math.round(title.width)}x${Math.round(title.height)} in ${size.width}px${r.overflow.length ? ' | ' + r.overflow.join(' | ') : ''}`,
  );
  if (size.primary) await page.screenshot({ path: join(ARTIFACTS, `${size.name}-Frage-lang.png`) });
  await ctx.close();
}

await browser.close();

/* --- the safe-area invariant, read off the source --- */

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const OWNERS = {
  'src/styles/tokens.css': 'the token definitions themselves',
  'src/components/ui.css': 'the Screen primitive',
  'src/app/appShell.css': 'the tab bar, and the update banner overlay',
  'src/features/today/today.css': 'the Today header, which is a Screen header',
  'src/features/onboarding/onboarding.css': 'top-level overlay, outside any Screen',
  'src/features/progress/questionDetail.css': 'top-level overlay, outside any Screen',
  'src/features/gym/gym.css': 'top-level overlay, outside any Screen',
};

const hits = walk(new URL('../../src/', import.meta.url).pathname)
  .filter((p) => p.endsWith('.css'))
  .flatMap((p) => {
    const rel = p.slice(p.indexOf('src/'));
    return readFileSync(p, 'utf8')
      .split('\n')
      .map((line, i) => ({ rel, line: i + 1, text: line.trim() }))
      .filter((h) => /safe-area-inset|--safe-(top|bottom|left|right)/.test(h.text));
  });

const strays = hits.filter((h) => !(h.rel in OWNERS));
check(
  'safe-area insets are owned by the layout layer and true overlays only',
  strays.length === 0,
  strays.map((h) => `${h.rel}:${h.line}`).join(', '),
);

/* Inside a Screen hierarchy the inset is spent once. The four route
   scrollers used to add `--safe-bottom` and the tab bar's height on top of
   the tab bar's own, which is what left dead space under every list. */
const scrollerRules = walk(new URL('../../src/features/', import.meta.url).pathname)
  .filter((p) => p.endsWith('.css'))
  .flatMap((p) => {
    const rel = p.slice(p.indexOf('src/'));
    const body = readFileSync(p, 'utf8');
    return [...body.matchAll(/\.\w+__scroll\s*\{([^}]*)\}/g)].map((m) => ({ rel, body: m[1] }));
  });
const stillDoubling = scrollerRules.filter((r) => /--safe-bottom|--tab-bar-height/.test(r.body));
check(
  'route scrollers no longer duplicate the tab bar reservation',
  stillDoubling.length === 0,
  stillDoubling.map((r) => r.rel).join(', '),
);

console.log('\n--- measurements (insets simulated: top 59, bottom 34) ---');
for (const m of measurements) {
  console.log(
    `${m.size} ${m.tab.padEnd(9)} header top ${String(m.headerTop).padStart(3)} pad ${String(m.headerPadTop).padStart(5)}  ` +
      `card x=${String(m.cardLeft).padStart(3)} w=${String(m.cardWidth).padStart(3)}  ` +
      `scroller ends ${m.scrollerBottom} (tab bar ${m.tabTop}-${m.tabBottom}) pad-bottom ${m.scrollerPadBottom} tail gap ${m.tailGap}`,
  );
}

console.log('\n--- NOT verifiable in a desktop browser ---');
console.log('The iOS status bar. `apple-mobile-web-app-status-bar-style` is honoured only by');
console.log('Safari on a home-screen install, so whether the white strip is gone and whether');
console.log('the status-bar glyphs stay readable is a device check, not a check in this file.');

process.exit(summary() ? 0 : 1);
