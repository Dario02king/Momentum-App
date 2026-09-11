/* Standalone demo host for the muscle map.
 *
 * DEMO ONLY. Every number below is fabricated. This file implements no
 * business logic: no scoring, no deltas, no "last trained", no persistence —
 * Momentum's core/gym already owns all of that and keeps owning it. What this
 * file demonstrates is exactly the integration surface:
 *
 *   host -> viewer   via data-* attributes
 *   viewer -> host   via CustomEvents
 *
 * The colour values mirror tokens.ts, which is the single source of truth.
 * Read them from there in the app; do not fork this copy.
 */

const IDENTITY = {
  chest: '#D9654E', back: '#2E6FB7', shoulders: '#E8A33D', biceps: '#7B5AC9',
  triceps: '#C45D9E', core: '#C9A227', quadriceps: '#1F9E94',
  hamstringsGlutes: '#8C6239', calves: '#4FB3E8', forearms: '#6E7B8B',
};
const STATE = {
  improved:         { text: 'Verbessert',           ink: '#177a4c', tint: '#e4f6ec' },
  declined:         { text: 'Zurückgegangen',       ink: '#bf394e', tint: '#fdecef' },
  unchanged:        { text: 'Gehalten',             ink: '#7a6410', tint: '#fdf3d4' },
  awaitingBaseline: { text: 'Kein Vergleich',       ink: '#166db6', tint: '#e6f2fd' },
  noData:           { text: 'Noch nicht trainiert', ink: '#8a8a95', tint: '#f2f2f6' },
};

function mutedIdentity(hex, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (c) => Math.round(c + (grey - c) * 0.13);
  return alpha >= 1 ? `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})` : `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, ${alpha})`;
}
function stateIntensity(state, pct) {
  if (state === 'noData') return 0;
  if (state === 'awaitingBaseline') return 0.42;
  if (state === 'unchanged') return 0.4;
  return Math.max(0.34, Math.min(1, 0.34 + (Math.abs(pct) / 12) * 0.66));
}

const MUSCLES = [
  { id: 'chest',            label: 'Brust',               state: 'improved',         pct: 12, delta: '+12 %', sub: 'Zuletzt vor 2 Tagen', series: [4, 4.6, 4.4, 5.2, 5.6, 5.4, 6.4, 7.0] },
  { id: 'back',             label: 'Rücken',              state: 'declined',         pct: -4, delta: '−4 %',  sub: 'Zuletzt vor 6 Tagen', series: [7, 7.2, 6.8, 6.9, 6.4, 6.2, 6.3, 5.9] },
  { id: 'shoulders',        label: 'Schultern',           state: 'improved',         pct: 6,  delta: '+6 %',  sub: 'Zuletzt vor 3 Tagen', series: [5, 5.1, 5.4, 5.3, 5.8, 6.0, 6.1, 6.4] },
  { id: 'biceps',           label: 'Bizeps',              state: 'awaitingBaseline', pct: 0,  delta: '—',     sub: 'Ein Trainingstag',    series: [5.4, 5.4, 5.4, 5.4, 5.4, 5.4, 5.4, 5.4] },
  { id: 'triceps',          label: 'Trizeps',             state: 'improved',         pct: 9,  delta: '+9 %',  sub: 'Zuletzt vor 2 Tagen', series: [4.2, 4.4, 4.8, 4.7, 5.3, 5.5, 5.8, 6.2] },
  { id: 'core',             label: 'Rumpf',               state: 'unchanged',        pct: 0,  delta: '0 %',   sub: 'Zuletzt vor 4 Tagen', series: [5.6, 5.5, 5.7, 5.6, 5.6, 5.7, 5.6, 5.6] },
  { id: 'quadriceps',       label: 'Quadrizeps',          state: 'declined',         pct: -3, delta: '−3 %',  sub: 'Zuletzt vor 8 Tagen', series: [6.8, 7.0, 6.9, 6.7, 6.6, 6.5, 6.6, 6.4] },
  { id: 'hamstringsGlutes', label: 'Beinbeuger & Gesäss', state: 'improved',         pct: 5,  delta: '+5 %',  sub: 'Zuletzt vor 5 Tagen', series: [5.0, 5.2, 5.1, 5.4, 5.5, 5.7, 5.6, 6.0] },
  { id: 'calves',           label: 'Waden',               state: 'noData',           pct: 0,  delta: '—',     sub: 'Noch keine Sätze',    series: [] },
  { id: 'forearms',         label: 'Unterarme',           state: 'noData',           pct: 0,  delta: '—',     sub: 'Noch keine Sätze',    series: [] },
];

/* 80x24, axis-less, no grid, line only. Flat line when there is nothing to
   compare; no sparkline at all when the group was never trained. */
function sparkline(series, color) {
  if (!series.length) return '<svg class="row__spark" width="80" height="24"></svg>';
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const flat = max - min < 0.0001;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * 74 + 3;
    const y = flat ? 12 : 20 - ((v - min) / span) * 16;
    return [x.toFixed(1), y.toFixed(1)];
  });
  const last = pts[pts.length - 1];
  return `<svg class="row__spark" width="80" height="24" viewBox="0 0 80 24" fill="none" aria-hidden="true">
      <polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="2.1" fill="${color}"/>
    </svg>`;
}

const viewer = document.getElementById('viewer');
const rowsEl = document.getElementById('rows');
let selected = 'chest';

const visuals = {};
for (const m of MUSCLES) {
  visuals[m.id] = { tint: STATE[m.state].ink, intensity: stateIntensity(m.state, m.pct) };
}
viewer.setAttribute('data-visuals', JSON.stringify(visuals));
viewer.setAttribute('data-selected', selected);

function paint() {
  rowsEl.innerHTML = MUSCLES.map((m) => {
    const st = STATE[m.state];
    const untrained = m.state === 'noData';
    const identity = untrained ? mutedIdentity(IDENTITY[m.id], 0.35) : mutedIdentity(IDENTITY[m.id]);
    const on = m.id === selected;
    return `<button class="row" type="button" data-id="${m.id}" aria-current="${on}">
        <span class="row__dot" style="background:${identity};box-shadow:${on ? '0 0 0 3px ' + mutedIdentity(IDENTITY[m.id], 0.22) : 'none'}"></span>
        <span class="row__text">
          <span class="row__name">${m.label}</span>
          <span class="row__sub">${m.sub}</span>
        </span>
        ${untrained ? '<svg class="row__spark" width="80" height="24"></svg>' : sparkline(m.series, mutedIdentity(IDENTITY[m.id]))}
        <span class="row__right">
          <span class="row__delta" style="color:${st.ink}">${m.delta}</span>
          <span class="row__badge" style="color:${st.ink};background:${st.tint}">${st.text}</span>
        </span>
      </button>`;
  }).join('');
}
paint();

rowsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.row');
  if (!btn) return;
  selected = btn.dataset.id;
  viewer.setAttribute('data-selected', selected);   // card, row and model stay in sync
  paint();
});

viewer.addEventListener('muscle-select', (e) => {
  selected = e.detail.id;
  viewer.setAttribute('data-selected', selected);
  paint();
});
viewer.addEventListener('body-rotate', (e) => {
  document.getElementById('angle').textContent = e.detail.angle + '° · ' + e.detail.view;
});
viewer.addEventListener('body-ready', (e) => {
  document.getElementById('status').textContent = e.detail.regions + ' Regionen · ' + e.detail.triangles.toLocaleString('de-CH') + ' Dreiecke';
});
viewer.addEventListener('body-fallback', (e) => {
  document.getElementById('status').textContent = e.detail.message;
});
