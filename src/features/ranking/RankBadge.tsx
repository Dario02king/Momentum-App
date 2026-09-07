import { useId } from 'react';
import type { RankId } from '../../core/config/constants';

/**
 * The rank badges (§15).
 *
 * One emblem family, built from layers that accumulate as the ladder rises:
 * a crest whose *silhouette* changes tier by tier, then wing plates, a
 * wreath, a starburst, a crown — and at the very top a form that leaves the
 * crest behind altogether.
 *
 * Three constraints shaped every decision here.
 *
 * **Identity has to survive 38px.** These render in the hero at 148 and in
 * the standings at 38, so what separates one rank from the next is outline,
 * dominant colour and one bold central mark — never fine ornament. Below
 * `DETAIL` the smallest elements are dropped rather than rendered into mud.
 *
 * **Colour has to reach the body.** An earlier pass washed the crest face
 * with a light inner bevel and every rank came out the same silver. The
 * bevel is a stroke now, not a fill, and the metal gradient keeps its
 * saturated mid-tone across most of the face.
 *
 * **No filters.** Depth comes from geometry: a shadow underlay, a diagonal
 * metal gradient, a clipped specular sweep and a shaded lower body. Gaussian
 * blurs would buy a little softness for a lot of paint cost on a screen that
 * can show a dozen badges at once.
 */

/** Below this rendered size, ornament that cannot read is left out. */
const DETAIL = 56;

interface Spec {
  /** Light, mid and shadow tones of the metal. The mid tone is the identity. */
  metal: [string, string, string];
  rim: string;
  glow: string;
  /** 0 = no aura, 1 = the strongest on the ladder. */
  aura: number;
  /** The central mark's colour. */
  accent: string;
  core: string;
  /** 0 none · 1 blade · 2 pair · 3 full wing. */
  wings: 0 | 1 | 2 | 3;
  /** Points in the starburst behind the crest; 0 for none. */
  burst: number;
  wreath: boolean;
  /** 0 none · 1 single spike · 2 three spikes. */
  crown: 0 | 1 | 2;
  emblem: 'pip' | 'chevron' | 'chevrons' | 'star' | 'starRing' | 'gem' | 'prism';
}

/*
 * The silhouettes. Each is a different outline rather than the same shield
 * with more drawn on it, because at 38px the outline is most of what a user
 * actually distinguishes: a flat-topped hex, a classic shield, a downward
 * spearhead, then three crests that grow shoulders and width.
 */
const CORES = {
  plain: 'M60 26 L90 44 V74 C90 94 77 108 60 115 C43 108 30 94 30 74 V44 Z',
  shield: 'M60 22 L95 40 V75 C95 97 80 113 60 121 C40 113 25 97 25 75 V40 Z',
  spear: 'M60 20 L97 39 V68 L60 124 L23 68 V39 Z',
  crest: 'M60 12 L69 27 L97 39 V72 C97 95 81 113 60 123 C39 113 23 95 23 72 V39 L51 27 Z',
  wide: 'M60 8 L71 24 L101 36 V71 C101 95 84 115 60 126 C36 115 19 95 19 71 V36 L49 24 Z',
  broad: 'M60 6 L73 22 L104 33 V69 C104 94 85 117 60 129 C35 117 16 94 16 69 V33 L47 22 Z',
  regal: 'M60 4 L75 20 L107 31 V67 C107 93 87 118 60 131 C33 118 13 93 13 67 V31 L45 20 Z',
} as const;

const SPECS: Record<RankId, Spec> = {
  rookie: {
    metal: ['#eef1f5', '#9aa4b3', '#4e5764'],
    rim: '#6b7482',
    glow: '#aab3c0',
    aura: 0,
    accent: '#f7f9fc',
    core: CORES.plain,
    wings: 0,
    burst: 0,
    wreath: false,
    crown: 0,
    emblem: 'pip',
  },
  challenger: {
    metal: ['#dcecff', '#4f8fd6', '#1c3f68'],
    rim: '#2f6099',
    glow: '#68a8ea',
    aura: 0.18,
    accent: '#f0f7ff',
    core: CORES.shield,
    wings: 0,
    burst: 0,
    wreath: false,
    crown: 0,
    emblem: 'chevron',
  },
  contender: {
    metal: ['#d6f6ee', '#25a58e', '#0b544a'],
    rim: '#12776a',
    glow: '#3fd0b4',
    aura: 0.28,
    accent: '#ebfffb',
    core: CORES.spear,
    wings: 1,
    burst: 0,
    wreath: false,
    crown: 0,
    emblem: 'chevrons',
  },
  elite: {
    metal: ['#e8dfff', '#7154dd', '#2f1f75'],
    rim: '#4f36b4',
    glow: '#9b7cf7',
    aura: 0.42,
    accent: '#f6f2ff',
    core: CORES.crest,
    wings: 1,
    burst: 0,
    wreath: false,
    crown: 1,
    emblem: 'star',
  },
  veteran: {
    metal: ['#ffe6c6', '#c2762f', '#5f3410'],
    rim: '#8d5119',
    glow: '#e0a061',
    aura: 0.54,
    accent: '#fff3e0',
    core: CORES.wide,
    wings: 2,
    burst: 0,
    wreath: true,
    crown: 1,
    emblem: 'star',
  },
  master: {
    metal: ['#fff4c8', '#dfa312', '#6f4c04'],
    rim: '#a3730a',
    glow: '#facf3f',
    aura: 0.7,
    accent: '#fffbe2',
    core: CORES.broad,
    wings: 3,
    burst: 16,
    wreath: true,
    crown: 1,
    emblem: 'starRing',
  },
  champion: {
    // Platinum-gold rather than a brighter yellow: at 38px Champion has to
    // separate from Master by more than saturation, so the body cools and
    // the centre turns crimson.
    metal: ['#fffdf0', '#e9d284', '#5f4a0c'],
    rim: '#7d6413',
    glow: '#ffe08a',
    aura: 0.86,
    accent: '#fff9df',
    core: CORES.regal,
    wings: 3,
    burst: 20,
    wreath: true,
    crown: 2,
    emblem: 'gem',
  },
  legend: {
    // A cold, deep core so the top of the ladder has weight as well as
    // shine; it also keeps Legend readable on the light standings list.
    metal: ['#e6fbff', '#3ba7e0', '#141c52'],
    rim: '#63d3f5',
    glow: '#63e0ff',
    aura: 1,
    accent: '#ffffff',
    // Legend is radial, not a crest; its field is drawn rather than a path.
    core: '',
    wings: 0,
    burst: 24,
    wreath: false,
    crown: 0,
    emblem: 'prism',
  },
};

function starPoints(cx: number, cy: number, radius: number, points = 5, inner = 0.42): string {
  return Array.from({ length: points * 2 }, (_, index) => {
    const angle = (Math.PI / points) * index - Math.PI / 2;
    const r = index % 2 === 0 ? radius : radius * inner;
    return `${(cx + Math.cos(angle) * r).toFixed(2)},${(cy + Math.sin(angle) * r).toFixed(2)}`;
  }).join(' ');
}

/*
 * Wings are layered blades rather than one outline: overlapping plates still
 * read as a wing when they are four pixels tall, where feather detail does
 * not. Drawn on the left; the right side is the same shape mirrored.
 */
const WINGS: Record<1 | 2 | 3, string[]> = {
  1: ['M30 50 L7 57 L30 68 Z'],
  2: ['M30 44 L2 48 L30 62 Z', 'M30 60 L8 70 L30 78 Z'],
  3: ['M28 36 L0 38 L28 54 Z', 'M28 52 L1 60 L28 70 Z', 'M28 68 L7 80 L28 86 Z'],
};

/** Where the wreath's leaves sit along the arc, and how each is turned. */
const LEAVES = [
  { x: 8, y: 72, angle: -32 },
  { x: 9, y: 92, angle: -8 },
  { x: 19, y: 112, angle: 16 },
  { x: 36, y: 130, angle: 40 },
];

/**
 * A rank the user has not reached yet.
 *
 * The silhouette stays — that is what makes the ladder browsable, and the
 * shape is the honest part of the promise. Everything that makes an earned
 * emblem *rich* is withheld: the metal goes to three neutral greys, the aura
 * to nothing, the central mark to the same grey as the body, and a frosted
 * veil is laid over the whole thing.
 *
 * The veil is drawn, not filtered. A Gaussian blur would soften it more
 * convincingly and cost real paint time on a screen showing eight badges at
 * once — and it would take the silhouette with it, which is the one thing
 * that has to survive. Diagonal hairlines over a pale scrim read as frosted
 * glass at 148px and as a grey plate at 32px, which is what each size needs.
 */
function toMystery(spec: Spec): Spec {
  return {
    ...spec,
    metal: ['#e4e5ea', '#b9bcc6', '#8b8f9b'],
    rim: '#9ea2ad',
    glow: '#c7cad3',
    aura: 0,
    accent: '#cfd2da',
  };
}

export function RankBadge({
  rankId,
  size = 132,
  animate = false,
  mystery = false,
}: {
  rankId: RankId;
  size?: number;
  animate?: boolean;
  /** The rank has not been reached. Shown, but not revealed. */
  mystery?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const spec = mystery ? toMystery(SPECS[rankId]) : SPECS[rankId];
  const id = (name: string) => `${name}-${uid}`;
  // Ornament that would read as detail is left out of a mystery badge at any
  // size: what is withheld is the richness, not the shape.
  const detailed = size >= DETAIL && !mystery;
  const isLegend = rankId === 'legend';
  const wing = spec.wings === 0 ? null : WINGS[spec.wings];

  return (
    <svg
      width={size}
      height={(size / 120) * 140}
      viewBox="0 0 120 140"
      fill="none"
      /* The rank's name is always beside it in text, so the emblem is
         decorative. `role="img"` alongside that only claims a name it has
         no way to supply. */
      aria-hidden="true"
      className={`badge-svg ${animate ? 'badge-svg--reveal' : ''} ${
        mystery ? 'badge-svg--mystery' : ''
      }`.trim()}
    >
      <defs>
        <linearGradient id={id('metal')} x1="0.15" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor={spec.metal[0]} />
          <stop offset="18%" stopColor={spec.metal[1]} />
          <stop offset="62%" stopColor={spec.metal[1]} />
          <stop offset="100%" stopColor={spec.metal[2]} />
        </linearGradient>
        <linearGradient id={id('wing')} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={spec.metal[1]} />
          <stop offset="100%" stopColor={spec.metal[2]} />
        </linearGradient>
        <radialGradient id={id('aura')} cx="0.5" cy="0.48" r="0.5">
          <stop offset="48%" stopColor={spec.glow} stopOpacity={spec.aura * 0.42} />
          <stop offset="100%" stopColor={spec.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('gem')} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor={spec.glow} />
          <stop offset="100%" stopColor={spec.metal[2]} />
        </linearGradient>
        <linearGradient id={id('jewel')} x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#ff9d8f" />
          <stop offset="42%" stopColor="#d9314a" />
          <stop offset="100%" stopColor="#67091f" />
        </linearGradient>
        {!isLegend && (
          <clipPath id={id('clip')}>
            <path d={spec.core} />
          </clipPath>
        )}
      </defs>

      {/* The field behind: an aura for every tier that has earned one. */}
      {spec.aura > 0 && <ellipse cx="60" cy="66" rx="60" ry="64" fill={`url(#${id('aura')})`} />}

      {/* A starburst, not scattered rays: one filled shape holds together at
          any size where it is visible at all. */}
      {spec.burst > 0 && (
        <g>
          <polygon
            points={starPoints(60, 68, 58, spec.burst, 0.66)}
            fill={spec.glow}
            opacity={detailed ? 0.34 : 0.42}
          />
          {detailed && (
            <polygon
              points={starPoints(60, 68, 52, spec.burst / 2, 0.55)}
              fill={spec.glow}
              opacity="0.5"
            />
          )}
        </g>
      )}

      {/* Wings: the silhouette's outward growth. */}
      {wing && (
        <g>
          {[0, 1].map((side) => (
            <g key={side} transform={side ? 'scale(-1 1) translate(-120 0)' : undefined}>
              {wing.map((blade, index) => (
                <path
                  key={index}
                  d={blade}
                  fill={`url(#${id('wing')})`}
                  stroke={spec.rim}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              ))}
            </g>
          ))}
        </g>
      )}

      {isLegend ? (
        <LegendCore id={id} spec={spec} detailed={detailed} />
      ) : (
        <>
          {/* Shadow underlay: depth without a filter. */}
          <path d={spec.core} fill={spec.metal[2]} opacity="0.5" transform="translate(0 3.5)" />
          <path d={spec.core} fill={`url(#${id('metal')})`} stroke={spec.rim} strokeWidth="2.4" />

          {/* Form: a specular sweep and a shaded lower body, both clipped to
              the crest so the edges stay crisp. */}
          <g clipPath={`url(#${id('clip')})`}>
            <path d="M-10 -10 L86 -10 L14 96 L-10 96 Z" fill="#ffffff" opacity="0.24" />
            <path d="M-10 150 L130 150 L130 92 L-10 122 Z" fill={spec.metal[2]} opacity="0.34" />
          </g>

          {/* Inner bevel: a stroked edge, so the body keeps its colour. */}
          <path
            d={spec.core}
            transform="translate(60 70) scale(0.84) translate(-60 -70)"
            fill="none"
            stroke={spec.metal[0]}
            strokeWidth="1.4"
            opacity="0.55"
          />

          <Emblem spec={spec} id={id} detailed={detailed} />
        </>
      )}

      {/* The wreath, in front and hugging the crest's outer contour — behind
          it, all that showed was stray leaf ticks. */}
      {spec.wreath && (
        <g fill="none" strokeLinecap="round">
          <path
            d="M12 66 C10 96 30 124 60 137"
            stroke={spec.metal[2]}
            strokeWidth="6"
            opacity="0.55"
          />
          <path
            d="M108 66 C110 96 90 124 60 137"
            stroke={spec.metal[2]}
            strokeWidth="6"
            opacity="0.55"
          />
          <path d="M12 66 C10 96 30 124 60 137" stroke={spec.metal[1]} strokeWidth="4.4" />
          <path d="M108 66 C110 96 90 124 60 137" stroke={spec.metal[1]} strokeWidth="4.4" />
          <g stroke={spec.metal[0]} strokeWidth="1.6" opacity="0.8">
            <path d="M12 66 C10 96 30 124 60 137" />
            <path d="M108 66 C110 96 90 124 60 137" />
          </g>
          {detailed && (
            <g fill={spec.metal[1]} stroke={spec.metal[0]} strokeWidth="0.9">
              {LEAVES.flatMap(({ x, y, angle }) => [
                <ellipse
                  key={`l${y}`}
                  cx={x}
                  cy={y}
                  rx="7.5"
                  ry="3.4"
                  transform={`rotate(${angle - 90} ${x} ${y})`}
                />,
                <ellipse
                  key={`r${y}`}
                  cx={120 - x}
                  cy={y}
                  rx="7.5"
                  ry="3.4"
                  transform={`rotate(${90 - angle} ${120 - x} ${y})`}
                />,
              ])}
            </g>
          )}
        </g>
      )}

      {/* The crown, last and on top: the clearest signal of the ladder's end. */}
      {spec.crown > 0 && (
        <g fill={spec.accent} stroke={spec.rim} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M60 0 L66 24 L54 24 Z" />
          {spec.crown === 2 && (
            <>
              <path d="M46 8 L52 26 L40 26 Z" />
              <path d="M74 8 L80 26 L68 26 Z" />
            </>
          )}
        </g>
      )}

      {/*
        The veil. Last, so it lies over everything, and drawn rather than
        filtered — see `toMystery`. The hairlines run at 35° so they never
        line up with the crest's own edges.
      */}
      {mystery && (
        <g>
          <defs>
            <pattern
              id={id('frost')}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(35)"
            >
              <rect width="7" height="2.6" fill="#ffffff" opacity="0.85" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="120" height="140" fill="#eceef3" opacity="0.5" />
          <rect x="0" y="0" width="120" height="140" fill={`url(#${id('frost')})`} opacity="0.4" />
        </g>
      )}
    </svg>
  );
}

function Emblem({
  spec,
  id,
  detailed,
}: {
  spec: Spec;
  id: (name: string) => string;
  detailed: boolean;
}) {
  const { emblem, accent } = spec;

  if (emblem === 'pip') {
    return <circle cx="60" cy="72" r="10.5" fill={accent} opacity="0.92" />;
  }

  if (emblem === 'chevron') {
    return (
      <path
        d="M45 65 L60 79 L75 65"
        fill="none"
        stroke={accent}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  if (emblem === 'chevrons') {
    return (
      <g fill="none" stroke={accent} strokeLinecap="round" strokeLinejoin="round">
        <path d="M44 56 L60 70 L76 56" strokeWidth="7" />
        <path d="M44 74 L60 88 L76 74" strokeWidth="6" opacity="0.72" />
      </g>
    );
  }

  if (emblem === 'star' || emblem === 'starRing') {
    return (
      <g>
        {emblem === 'starRing' && detailed && (
          <circle
            cx="60"
            cy="68"
            r="25"
            fill="none"
            stroke={accent}
            strokeWidth="1.8"
            opacity="0.55"
          />
        )}
        <polygon points={starPoints(60, 68, 19)} fill={accent} />
        {detailed && (
          <polygon points={starPoints(59, 67, 19)} fill="#ffffff" opacity="0.3" />
        )}
      </g>
    );
  }

  if (emblem === 'gem') {
    return (
      <g>
        <path
          d="M60 44 L79 64 L60 98 L41 64 Z"
          fill={`url(#${id('jewel')})`}
          stroke={accent}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M41 64 H79" stroke={accent} strokeWidth="1.3" opacity="0.85" />
        <path d="M60 44 L50 64 L60 98 Z" fill="#ffffff" opacity="0.2" />
        {detailed && (
          <>
            <polygon points={starPoints(31, 44, 5.5)} fill={accent} />
            <polygon points={starPoints(89, 44, 5.5)} fill={accent} />
          </>
        )}
      </g>
    );
  }

  return null;
}

/**
 * Legend abandons the crest.
 *
 * Every other rank is a shield that grew; this is a radiant core inside a
 * broken orbit. The difference is one of kind rather than degree — the top
 * of the ladder should not read as "one more shield, but shinier".
 */
function LegendCore({
  id,
  spec,
  detailed,
}: {
  id: (name: string) => string;
  spec: Spec;
  detailed: boolean;
}) {
  const points = detailed ? 12 : 8;

  return (
    <g>
      {/* The orbit, deliberately incomplete — and dropped when it would be
          two pixels of dashed line. */}
      {detailed && (
        <>
          <circle
            cx="60"
            cy="68"
            r="52"
            fill="none"
            stroke={spec.rim}
            strokeWidth="1.2"
            opacity="0.4"
          />
          <circle
            cx="60"
            cy="68"
            r="46"
            fill="none"
            stroke={spec.glow}
            strokeWidth="3.2"
            opacity="0.9"
            strokeDasharray="52 22"
            strokeLinecap="round"
          />
          {Array.from({ length: 4 }, (_, index) => {
            const angle = (index / 4) * Math.PI * 2 - Math.PI / 4;
            return (
              <circle
                key={index}
                cx={60 + Math.cos(angle) * 46}
                cy={68 + Math.sin(angle) * 46}
                r="3.6"
                fill={spec.accent}
              />
            );
          })}
        </>
      )}

      {/* A radiant core: the silhouette no other rank has. */}
      <polygon
        points={starPoints(60, 68, 40, points, 0.46)}
        fill={spec.metal[2]}
        opacity="0.55"
        transform="translate(0 3.5)"
      />
      <polygon
        points={starPoints(60, 68, 40, points, 0.46)}
        fill={`url(#${id('metal')})`}
        stroke={spec.rim}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon points={starPoints(60, 68, 29, points, 0.5)} fill="#ffffff" opacity="0.18" />

      {/* The prism at the centre. */}
      <polygon
        points="60,40 78,68 60,96 42,68"
        fill={`url(#${id('gem')})`}
        stroke={spec.accent}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M42 68 H78" stroke={spec.accent} strokeWidth="1.1" opacity="0.85" />
      <path d="M60 40 L51 68 L60 96 Z" fill="#ffffff" opacity="0.26" />
      <circle cx="60" cy="68" r="5.5" fill={spec.accent} />
    </g>
  );
}
