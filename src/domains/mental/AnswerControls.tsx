import { SCALE_VALUES, SCALE_BAND_LABEL_KEYS, scaleBandOf } from '../../core/scoring/scale';
import type { AnswerValue } from '../../core/model';
import { useT } from '../../i18n/I18nProvider';
import './answerControls.css';

/**
 * The two ways a Mental Wellbeing question is answered.
 *
 * Both save on tap — there is no confirm step anywhere in the daily
 * check-in — and both keep a third state, unanswered, distinct from a
 * negative answer. Tapping the selected option again clears it.
 */

export function BooleanAnswer({
  value,
  onChange,
  disabled = false,
  questionText,
}: {
  value: boolean | null;
  onChange(next: AnswerValue | null): void;
  disabled?: boolean;
  questionText: string;
}) {
  const t = useT();
  return (
    <div className="answer-boolean" role="group" aria-label={t('answer.for', { question: questionText })}>
      <button
        type="button"
        className="answer-boolean__option answer-boolean__option--yes"
        aria-pressed={value === true}
        disabled={disabled}
        onClick={() => onChange(value === true ? null : true)}
      >
        {t('answer.yes')}
      </button>
      <button
        type="button"
        className="answer-boolean__option answer-boolean__option--no"
        aria-pressed={value === false}
        disabled={disabled}
        onClick={() => onChange(value === false ? null : false)}
      >
        {t('answer.no')}
      </button>
    </div>
  );
}

/**
 * Ten tappable numbers carrying a soft colour ramp from poor to very good,
 * so the scale reads as a direction before it reads as arithmetic. The
 * qualitative band is spelled out whenever a value is chosen — the number
 * alone is not an answer, and colour never carries the meaning by itself.
 */
export function ScaleAnswer({
  value,
  onChange,
  disabled = false,
  questionText,
}: {
  value: number | null;
  onChange(next: AnswerValue | null): void;
  disabled?: boolean;
  questionText: string;
}) {
  const t = useT();
  const band = value === null ? null : scaleBandOf(value);

  return (
    <div className="answer-scale">
      <div
        className="answer-scale__row"
        role="group"
        aria-label={t('answer.for', { question: questionText })}
      >
        {SCALE_VALUES.map((option) => {
          const optionBand = scaleBandOf(option);
          return (
            <button
              key={option}
              type="button"
              className={`answer-scale__value answer-scale__value--${optionBand}`}
              aria-pressed={value === option}
              aria-label={t('answer.scaleValue', {
                value: option,
                band: t(SCALE_BAND_LABEL_KEYS[optionBand]),
              })}
              disabled={disabled}
              onClick={() => onChange(value === option ? null : option)}
            >
              {option}
            </button>
          );
        })}
      </div>
      {band ? (
        <p className={`answer-scale__band answer-scale__band--${band}`} aria-live="polite">
          {t(SCALE_BAND_LABEL_KEYS[band])}
        </p>
      ) : null}
    </div>
  );
}
