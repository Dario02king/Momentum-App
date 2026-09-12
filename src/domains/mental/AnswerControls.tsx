import type { KeyboardEvent } from 'react';
import { SCALE_VALUES, STATUS_LABEL_KEYS, scaleBandOf } from '../../core/scoring/scale';
import type { AnswerValue } from '../../core/model';
import { useT } from '../../i18n/I18nProvider';
import './answerControls.css';

/**
 * The two ways a Mental Wellbeing question is answered.
 *
 * Both save on tap — there is no confirm step anywhere in the daily
 * check-in — and both are single-choice: re-tapping the selected option
 * leaves it selected. Removing an answer is a deliberate, separate action,
 * because an accidental second tap must never delete data.
 *
 * That makes these radio groups rather than toggle buttons, so they carry
 * radio semantics: one tab stop per group, arrow keys move between options,
 * and `aria-checked` rather than `aria-pressed`.
 */

/**
 * Arrow-key movement within a radio group, selecting as it goes.
 *
 * Exported because it is the behaviour every single-choice group in the app
 * owes a keyboard user, and a second copy of it would be a second place for
 * it to be subtly wrong. The options must be the direct children of the
 * element carrying `role="radiogroup"`.
 */
export function useRadioKeys(count: number, select: (index: number) => void) {
  return (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + count) % count;
    select(next);
    const group = event.currentTarget.parentElement;
    const target = group?.children[next];
    if (target instanceof HTMLElement) target.focus();
  };
}

export function BooleanAnswer({
  value,
  onChange,
  disabled = false,
  questionText,
}: {
  value: boolean | null;
  onChange(next: AnswerValue): void;
  disabled?: boolean;
  questionText: string;
}) {
  const t = useT();
  const options: { key: string; label: string; answer: boolean }[] = [
    { key: 'yes', label: t('answer.yes'), answer: true },
    { key: 'no', label: t('answer.no'), answer: false },
  ];
  const selectedIndex = value === null ? -1 : value ? 0 : 1;
  const onKeyDown = useRadioKeys(options.length, (index) => onChange(options[index]!.answer));

  return (
    <div
      className="answer-boolean"
      role="radiogroup"
      aria-label={t('answer.for', { question: questionText })}
    >
      {options.map((option, index) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={value === option.answer}
          // One tab stop for the whole group; arrows move within it.
          tabIndex={selectedIndex === index || (selectedIndex === -1 && index === 0) ? 0 : -1}
          className={`answer-boolean__option answer-boolean__option--${option.key}`}
          disabled={disabled}
          onClick={() => onChange(option.answer)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
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
  onChange(next: AnswerValue): void;
  disabled?: boolean;
  questionText: string;
}) {
  const t = useT();
  const band = value === null ? null : scaleBandOf(value);
  const selectedIndex = value === null ? -1 : SCALE_VALUES.indexOf(value);
  const onKeyDown = useRadioKeys(SCALE_VALUES.length, (index) => onChange(SCALE_VALUES[index]!));

  return (
    <div className="answer-scale">
      <div
        className="answer-scale__row"
        role="radiogroup"
        aria-label={t('answer.for', { question: questionText })}
      >
        {SCALE_VALUES.map((option, index) => {
          const optionBand = scaleBandOf(option);
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={value === option}
              tabIndex={selectedIndex === index || (selectedIndex === -1 && index === 0) ? 0 : -1}
              className={`answer-scale__value answer-scale__value--${optionBand}`}
              aria-label={t('answer.scaleValue', {
                value: option,
                band: t(STATUS_LABEL_KEYS[optionBand]),
              })}
              disabled={disabled}
              onClick={() => onChange(option)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {option}
            </button>
          );
        })}
      </div>
      {band ? (
        <p className={`answer-scale__band answer-scale__band--${band}`} aria-live="polite">
          {t(STATUS_LABEL_KEYS[band])}
        </p>
      ) : null}
    </div>
  );
}
