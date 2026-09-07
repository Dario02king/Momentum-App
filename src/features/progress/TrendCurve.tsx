import { useId } from 'react';
import type { Trend } from '../../core/trends';
import { useT } from '../../i18n/I18nProvider';

/**
 * The hero of the Progress screen.
 *
 * It answers a directional question, so it is drawn without axes, gridlines
 * or tick labels — a shape, not a trading terminal. The numbers that matter
 * are stated above it in words and figures instead.
 *
 * That is also what makes it safe to treat as a single image: the direction,
 * the current value and the one before it are already real text next to the
 * chart, so a reader who never sees the path still has the answer. The label
 * here adds what only the shape knew — where the line started, and how far
 * it travelled in between.
 */
export function TrendCurve({ trend, rangeDays }: { trend: Trend; rangeDays: number }) {
  const t = useT();
  // Ids inside an SVG are document-global; a hardcoded one collides the
  // moment a second chart is on screen, and the fill silently follows the
  // first one's gradient.
  const fillId = `trend-fill-${useId().replace(/:/g, '')}`;

  const points = trend.points;
  const values = points.map((point) => point.smoothed);
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return null;

  const width = 320;
  const height = 96;
  const min = Math.min(...known);
  const max = Math.max(...known);
  // A flat line should read as flat, not be stretched to fill the box.
  const span = Math.max(12, max - min);
  const mid = (max + min) / 2;
  const low = mid - span / 2;

  const x = (index: number) =>
    points.length === 1 ? 0 : (index / (points.length - 1)) * width;
  const y = (value: number) => height - ((value - low) / span) * height;

  // Missing days break the line rather than being interpolated across.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.smoothed === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point.smoothed).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  const lastIndex = points.reduce(
    (last, point, index) => (point.smoothed === null ? last : index),
    -1,
  );
  const lastValue = lastIndex >= 0 ? points[lastIndex]!.smoothed : null;

  const areaPath =
    segments.length === 1
      ? `${segments[0]} L ${x(lastIndex).toFixed(1)} ${height} L ${x(points.findIndex((p) => p.smoothed !== null)).toFixed(1)} ${height} Z`
      : null;

  const first = known[0]!;
  const direction = t(
    trend.direction === 'rising'
      ? 'progress.rising'
      : trend.direction === 'falling'
        ? 'progress.falling'
        : 'progress.steady',
  );

  return (
    <svg
      className="trend__chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t('progress.chartLabel', {
        days: rangeDays,
        direction,
        from: Math.round(first),
        to: Math.round(known[known.length - 1]!),
        min: Math.round(min),
        max: Math.round(max),
      })}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {areaPath ? <path d={areaPath} fill={`url(#${fillId})`} /> : null}

      {segments.map((segment, index) => (
        <path
          key={index}
          d={segment}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {lastValue !== null ? (
        <circle cx={x(lastIndex)} cy={y(lastValue)} r="4" fill="var(--accent)" />
      ) : null}
    </svg>
  );
}
