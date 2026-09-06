import { useState } from 'react';
import { SCORE_BANDS, type ScoreBandId } from '../../core/config/constants';
import type { DateKey } from '../../core/dates';
import { ChevronDownIcon } from '../../components/Icons';
import { useT } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n';

export interface HeatmapRow {
  key: string;
  label: string;
  values: (number | null)[];
  /** Rows nested under this one, revealed on tap. */
  children?: HeatmapRow[];
}

const BAND_LABEL_KEYS: Record<ScoreBandId, TranslationKey> = {
  low: 'score.low',
  fair: 'score.fair',
  good: 'score.good',
  high: 'score.high',
};

export function bandOf(value: number): ScoreBandId {
  for (const band of SCORE_BANDS) {
    if (value >= band.from && value < band.to) return band.id;
  }
  return 'high';
}

/**
 * Thirty days, one strip per row.
 *
 * The value is the **height** of each bar, not its colour: the four bands sit
 * at similar luminance, so hue alone would leave a weak day and a strong one
 * confusable. Colour reinforces a reading that height already carries, and
 * an empty day is simply an unfilled track rather than another colour.
 */
function Strip({ values, label }: { values: (number | null)[]; label: string }) {
  const t = useT();
  const scored = values.filter((value): value is number => value !== null);
  const average = scored.length
    ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length)
    : null;

  return (
    <div
      className="heatmap__strip"
      role="img"
      aria-label={
        average === null
          ? `${label}: ${t('score.none')}`
          : `${label}: ${t('heatmap.average', { value: average })}`
      }
    >
      {values.map((value, index) => (
        <span key={index} className="heatmap__cell">
          {value === null ? (
            <span className="heatmap__empty" />
          ) : (
            <span
              className={`heatmap__bar heatmap__bar--${bandOf(value)}`}
              // A floor of 8% so a genuine zero still reads as a recorded day
              // rather than as no data at all.
              style={{ height: `${Math.max(8, value)}%` }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

function Row({ row, depth = 0 }: { row: HeatmapRow; depth?: number }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const scored = row.values.filter((value): value is number => value !== null);
  const average = scored.length
    ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length)
    : null;
  const expandable = Boolean(row.children?.length);

  const header = (
    <>
      <span className="heatmap__label">{row.label}</span>
      <span className="heatmap__average">
        {average === null ? t('score.none') : `${average} %`}
      </span>
      {expandable ? (
        <ChevronDownIcon size={16} className={open ? 'heatmap__chevron--open' : undefined} />
      ) : null}
    </>
  );

  return (
    <div className={`heatmap__row heatmap__row--depth${depth}`}>
      {expandable ? (
        <button
          type="button"
          className="heatmap__header heatmap__header--tappable"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {header}
        </button>
      ) : (
        <div className="heatmap__header">{header}</div>
      )}
      <Strip values={row.values} label={row.label} />
      {open && row.children
        ? row.children.map((child) => <Row key={child.key} row={child} depth={depth + 1} />)
        : null}
    </div>
  );
}

export function Heatmap({ rows, days }: { rows: HeatmapRow[]; days: DateKey[] }) {
  const t = useT();
  return (
    <div className="heatmap">
      {rows.map((row) => (
        <Row key={row.key} row={row} />
      ))}

      <p className="heatmap__range">{t('heatmap.range', { count: days.length })}</p>

      {/* Colour is explained in words; nothing here depends on telling two
          hues apart. */}
      <ul className="heatmap__legend">
        {SCORE_BANDS.map((band) => (
          <li key={band.id} className="heatmap__legendItem">
            <span className={`heatmap__swatch heatmap__swatch--${band.id}`} aria-hidden="true" />
            {t(BAND_LABEL_KEYS[band.id])}
          </li>
        ))}
        <li className="heatmap__legendItem">
          <span className="heatmap__swatch heatmap__swatch--none" aria-hidden="true" />
          {t('score.none')}
        </li>
      </ul>
    </div>
  );
}
