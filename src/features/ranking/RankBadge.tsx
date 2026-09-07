import { useId } from 'react';
import type { RankId } from '../../core/config/constants';

/**
 * The rank badges (§15).
 *
 * Original geometry, drawn here rather than borrowed: a shield that gains
 * framing, facets, ornament and light as the ladder rises, and a Legend mark
 * that deliberately abandons the shield altogether.
 *
 * These are the one place in Momentum allowed to be loud, and they only work
 * because everything around them is calm — so the drama lives entirely
 * inside this component and the dark surface it sits on.
 */

const SHIELD = 'M60 10 L104 28 V70 C104 98 85 118 60 128 C35 118 16 98 16 70 V28 Z';

interface Palette {
  /** Light, mid and shadow tones of the metal. */
  metal: [string, string, string];
  accent: string;
  rim: string;
  glow: string;
  /** 0 for none, 1 for the strongest treatment on the ladder. */
  glowStrength: number;
}

const PALETTES: Record<RankId, Palette> = {
  rookie: {
    metal: ['#cfd4dc', '#9aa2ae', '#6d7480'],
    accent: '#e8ebef',
    rim: '#7e8692',
    glow: '#aab2be',
    glowStrength: 0.12,
  },
  challenger: {
    metal: ['#d8e3ee', '#94a8bd', '#5f7286'],
    accent: '#eaf2fa',
    rim: '#6d8299',
    glow: '#7ea6cc',
    glowStrength: 0.2,
  },
  contender: {
    metal: ['#cfe0e6', '#79a2b0', '#41616e'],
    accent: '#e6f5f9',
    rim: '#4d7381',
    glow: '#5fa8bd',
    glowStrength: 0.3,
  },
  elite: {
    metal: ['#dcd6f7', '#9c8ee0', '#5f4fa8'],
    accent: '#f0ecff',
    rim: '#6c5cc4',
    glow: '#8f7ff0',
    glowStrength: 0.42,
  },
  veteran: {
    metal: ['#f0d9b8', '#c8994f', '#8a6427'],
    accent: '#fbeed6',
    rim: '#9b7433',
    glow: '#d8a44f',
    glowStrength: 0.5,
  },
  master: {
    metal: ['#ffe9ae', '#e0b53d', '#9b7511'],
    accent: '#fff6d4',
    rim: '#b98f1c',
    glow: '#f2c445',
    glowStrength: 0.66,
  },
  champion: {
    metal: ['#fff2d0', '#ecc463', '#a97c1c'],
    accent: '#fffaf0',
    rim: '#c79a2b',
    glow: '#ffd76a',
    glowStrength: 0.82,
  },
  legend: {
    metal: ['#eafcff', '#7fe4f0', '#3f7fd0'],
    accent: '#ffffff',
    rim: '#8ad9ff',
    glow: '#7ce0ff',
    glowStrength: 1,
  },
};

export function RankBadge({
  rankId,
  size = 132,
  animate = false,
}: {
  rankId: RankId;
  size?: number;
  animate?: boolean;
}) {
  const uid = useId().replace(/[:]/g, '');
  const palette = PALETTES[rankId];
  const id = (name: string) => `${name}-${uid}`;

  return (
    <svg
      width={size}
      height={(size / 120) * 140}
      viewBox="0 0 120 140"
      fill="none"
      role="img"
      aria-hidden="true"
      className={`badge-svg ${animate ? 'badge-svg--reveal' : ''}`.trim()}
    >
      <defs>
        <linearGradient id={id('metal')} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor={palette.metal[0]} />
          <stop offset="48%" stopColor={palette.metal[1]} />
          <stop offset="100%" stopColor={palette.metal[2]} />
        </linearGradient>
        {/* A narrow bright band across the upper third reads as a polished
            surface catching light, which flat fills never do. */}
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="42%" stopColor="#fff" stopOpacity={0.16 + palette.glowStrength * 0.3} />
          <stop offset="58%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('halo')} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0%" stopColor={palette.glow} stopOpacity={palette.glowStrength * 0.55} />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('gem')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={palette.accent} />
          <stop offset="100%" stopColor={palette.glow} />
        </linearGradient>
      </defs>

      {/* Halo: present for everyone, but only meaningful high up the ladder. */}
      <ellipse cx="60" cy="66" rx="58" ry="62" fill={`url(#${id('halo')})`} />

      {rankId === 'legend' ? (
        <LegendMark id={id} palette={palette} />
      ) : (
        <>
          {/* Rays behind the shield, from Master upwards. */}
          {(rankId === 'master' || rankId === 'champion') && (
            <g opacity={rankId === 'champion' ? 0.75 : 0.5}>
              {Array.from({ length: 12 }, (_, index) => {
                const angle = (index / 12) * Math.PI * 2;
                const inner = rankId === 'champion' ? 46 : 44;
                const outer = rankId === 'champion' ? 62 : 56;
                return (
                  <line
                    key={index}
                    x1={60 + Math.cos(angle) * inner}
                    y1={68 + Math.sin(angle) * inner}
                    x2={60 + Math.cos(angle) * outer}
                    y2={68 + Math.sin(angle) * outer}
                    stroke={palette.glow}
                    strokeWidth={index % 3 === 0 ? 3 : 1.4}
                    strokeLinecap="round"
                    opacity={index % 3 === 0 ? 0.8 : 0.45}
                  />
                );
              })}
            </g>
          )}

          {/* Outer frame: absent, thin, double or ornate. */}
          {rankId !== 'rookie' && (
            <path
              d={SHIELD}
              transform="translate(60 69) scale(1.09) translate(-60 -69)"
              fill="none"
              stroke={palette.rim}
              strokeWidth={rankId === 'veteran' || rankId === 'champion' ? 3 : 1.6}
              opacity={0.75}
            />
          )}
          {(rankId === 'veteran' || rankId === 'master' || rankId === 'champion') && (
            <path
              d={SHIELD}
              transform="translate(60 69) scale(1.17) translate(-60 -69)"
              fill="none"
              stroke={palette.rim}
              strokeWidth="1.2"
              opacity={0.45}
            />
          )}

          {/* Side flanges add mass from Veteran up. */}
          {(rankId === 'veteran' || rankId === 'master' || rankId === 'champion') && (
            <>
              <path
                d="M14 52 L2 62 L14 76 Z"
                fill={`url(#${id('metal')})`}
                stroke={palette.rim}
                strokeWidth="1"
              />
              <path
                d="M106 52 L118 62 L106 76 Z"
                fill={`url(#${id('metal')})`}
                stroke={palette.rim}
                strokeWidth="1"
              />
            </>
          )}

          <path d={SHIELD} fill={`url(#${id('metal')})`} stroke={palette.rim} strokeWidth="2" />
          <path d={SHIELD} fill={`url(#${id('sheen')})`} />

          {/* Inner bevel: the dimensional step that appears at Contender. */}
          {rankId !== 'rookie' && rankId !== 'challenger' && (
            <path
              d={SHIELD}
              transform="translate(60 69) scale(0.8) translate(-60 -69)"
              fill="none"
              stroke={palette.accent}
              strokeWidth="1.4"
              opacity="0.55"
            />
          )}

          {/* Centre mark, growing in complexity with the rank. */}
          {rankId === 'rookie' && <circle cx="60" cy="68" r="9" fill={palette.accent} opacity="0.8" />}

          {rankId === 'challenger' && (
            <>
              <path
                d="M46 62 L60 74 L74 62"
                fill="none"
                stroke={palette.accent}
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="30" cy="36" r="3" fill={palette.accent} opacity="0.8" />
              <circle cx="90" cy="36" r="3" fill={palette.accent} opacity="0.8" />
            </>
          )}

          {rankId === 'contender' && (
            <>
              <path
                d="M44 58 L60 72 L76 58"
                fill="none"
                stroke={palette.accent}
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M44 76 L60 90 L76 76"
                fill="none"
                stroke={palette.accent}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
              />
            </>
          )}

          {(rankId === 'elite' || rankId === 'veteran' || rankId === 'master') && (
            <Star cx={60} cy={rankId === 'master' ? 62 : 66} r={rankId === 'elite' ? 17 : 15} fill={palette.accent} />
          )}

          {rankId === 'veteran' && (
            <>
              <path d="M40 92 L60 102 L80 92" fill="none" stroke={palette.accent} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
              <path d="M44 102 L60 110 L76 102" fill="none" stroke={palette.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
            </>
          )}

          {rankId === 'master' && (
            <>
              {/* Laurel arcs — the first ornament that is not a chevron. */}
              <path d="M34 76 C34 96 46 108 60 112" fill="none" stroke={palette.accent} strokeWidth="2.5" opacity="0.75" strokeLinecap="round" />
              <path d="M86 76 C86 96 74 108 60 112" fill="none" stroke={palette.accent} strokeWidth="2.5" opacity="0.75" strokeLinecap="round" />
              <circle cx="60" cy="92" r="4" fill={palette.accent} opacity="0.9" />
            </>
          )}

          {rankId === 'champion' && (
            <>
              {/* A cut jewel rather than a flat mark. */}
              <path d="M60 44 L78 62 L60 96 L42 62 Z" fill={`url(#${id('gem')})`} stroke={palette.accent} strokeWidth="1.4" />
              <path d="M42 62 H78" stroke={palette.accent} strokeWidth="1" opacity="0.85" />
              <path d="M60 44 V96" stroke={palette.accent} strokeWidth="0.9" opacity="0.5" />
              <path d="M60 44 L51 62 L60 96" fill="#fff" opacity="0.18" />
              <Star cx={31} cy={44} r={5} fill={palette.accent} />
              <Star cx={89} cy={44} r={5} fill={palette.accent} />
              <Star cx={60} cy={116} r={4} fill={palette.accent} />
            </>
          )}
        </>
      )}
    </svg>
  );
}

function Star({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    const radius = index % 2 === 0 ? r : r * 0.42;
    return `${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(' ');
  return <polygon points={points} fill={fill} />;
}

/**
 * Legend abandons the shield entirely — an eight-point prism inside a broken
 * orbit. Nothing else on the ladder shares its silhouette, which is the
 * point: it should not read as "one more shield, but shinier".
 */
function LegendMark({ id, palette }: { id: (name: string) => string; palette: Palette }) {
  return (
    <g>
      <circle cx="60" cy="68" r="52" fill="none" stroke={palette.rim} strokeWidth="1.2" opacity="0.5" />
      <circle
        cx="60"
        cy="68"
        r="45"
        fill="none"
        stroke={palette.glow}
        strokeWidth="2.5"
        opacity="0.85"
        strokeDasharray="52 18"
        strokeLinecap="round"
      />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2 - Math.PI / 2;
        return (
          <circle
            key={index}
            cx={60 + Math.cos(angle) * 45}
            cy={68 + Math.sin(angle) * 45}
            r={index % 2 === 0 ? 3.2 : 1.8}
            fill={palette.accent}
          />
        );
      })}

      {/* The prism: four kite facets meeting at the centre. */}
      <path d="M60 20 L82 68 L60 116 L38 68 Z" fill={`url(#${id('metal')})`} stroke={palette.accent} strokeWidth="1.6" />
      <path d="M16 68 L60 46 L104 68 L60 90 Z" fill={`url(#${id('gem')})`} opacity="0.9" stroke={palette.accent} strokeWidth="1.2" />
      <path d="M60 20 L60 116" stroke={palette.accent} strokeWidth="0.9" opacity="0.55" />
      <path d="M16 68 H104" stroke={palette.accent} strokeWidth="0.9" opacity="0.45" />
      <path d="M60 46 L82 68 L60 90 L38 68 Z" fill="#fff" opacity="0.22" />
      <circle cx="60" cy="68" r="6" fill={palette.accent} />
    </g>
  );
}
