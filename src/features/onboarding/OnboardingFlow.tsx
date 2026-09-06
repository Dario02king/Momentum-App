import { useMemo, useState } from 'react';
import { SPORTS } from '../../core/config/constants';
import type { QuestionType } from '../../core/model';
import { Button, SelectionMark } from '../../components';
import { ChevronLeftIcon, PlusIcon, SparkIcon } from '../../components/Icons';
import { QuestionSheet } from '../../domains/mental/QuestionSheet';
import { questionTypeBadgeKey } from '../../domains/mental/questionLabels';
import { TargetPicker } from '../../domains/sports/TargetPicker';
import { useI18n, useT } from '../../i18n/I18nProvider';
import type { OnboardingSelection, QuestionDraft } from '../../storage/services/configurationService';
import { suggestedQuestions } from './suggestedQuestions';
import './onboarding.css';

type Step = 'welcome' | 'questions' | 'sports' | 'summary';
const STEPS: Step[] = ['welcome', 'questions', 'sports', 'summary'];

/**
 * Four screens, one idea each, and a way out of every one.
 *
 * Neither domain is required: both middle steps can be skipped, and the flow
 * still ends in a working app. Nothing here explains the product at length —
 * the tagline states it once and the rest is choices.
 */
export function OnboardingFlow({ onFinish }: { onFinish(selection: OnboardingSelection): void }) {
  const t = useT();
  const { language } = useI18n();
  const suggestions = useMemo(() => suggestedQuestions(language), [language]);

  const [stepIndex, setStepIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customQuestions, setCustomQuestions] = useState<QuestionDraft[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sportsTarget, setSportsTarget] = useState<number | null>(null);

  const step = STEPS[stepIndex]!;
  const go = (delta: number) => setStepIndex((index) => Math.min(STEPS.length - 1, Math.max(0, index + delta)));

  const chosenQuestions: QuestionDraft[] = [
    ...suggestions.filter((s) => selectedIds.includes(s.id)).map((s) => ({ text: s.text, type: s.type })),
    ...customQuestions,
  ];

  const toggleSuggestion = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const finish = (target: number | null) =>
    onFinish({ questions: chosenQuestions, sportsTargetPerWeek: target });

  return (
    <div className="onboarding">
      {step === 'welcome' ? null : (
        <div className="onboarding__progress" role="group" aria-label={t('onboarding.step', { current: stepIndex + 1, total: STEPS.length })}>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => go(-1)}
            aria-label={t('common.back')}
            style={{ marginLeft: -12, paddingLeft: 12, paddingRight: 12 }}
          >
            <ChevronLeftIcon />
          </button>
          {STEPS.map((value, index) => (
            <span
              key={value}
              className={`onboarding__dot ${index === stepIndex ? 'onboarding__dot--active' : ''}`.trim()}
            />
          ))}
        </div>
      )}

      {step === 'welcome' ? (
        <>
          <div className="welcome">
            <span className="welcome__mark" aria-hidden="true">
              <SparkIcon size={34} />
            </span>
            <h1 className="welcome__tagline">{t('app.tagline')}</h1>
            <p className="onboarding__lead">{t('onboarding.welcome.body')}</p>
          </div>
          <div className="onboarding__footer">
            <Button variant="primary" block onClick={() => go(1)}>
              {t('onboarding.welcome.start')}
            </Button>
          </div>
        </>
      ) : null}

      {step === 'questions' ? (
        <>
          <div className="onboarding__body">
            <div>
              <h1 className="onboarding__title">{t('onboarding.questions.title')}</h1>
              <p className="onboarding__lead" style={{ marginTop: 8 }}>
                {t('onboarding.questions.body')}
              </p>
            </div>

            <div className="question-list">
              {suggestions.map((suggestion) => {
                const selected = selectedIds.includes(suggestion.id);
                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="question-pick"
                    aria-pressed={selected}
                    onClick={() => toggleSuggestion(suggestion.id)}
                    style={{ ['--selection-accent' as string]: 'var(--pastel-lilac)' }}
                  >
                    <span className="question-pick__body">
                      <span className="question-pick__text">{suggestion.text}</span>
                      <span className={`badge badge--${suggestion.type}`} style={{ alignSelf: 'flex-start' }}>
                        {t(questionTypeBadgeKey(suggestion.type))}
                      </span>
                    </span>
                    <SelectionMark selected={selected} />
                  </button>
                );
              })}

              {customQuestions.map((question, index) => (
                <button
                  key={`custom-${index}`}
                  type="button"
                  className="question-pick"
                  aria-pressed="true"
                  onClick={() =>
                    setCustomQuestions((current) => current.filter((_, i) => i !== index))
                  }
                  style={{ ['--selection-accent' as string]: 'var(--pastel-lilac)' }}
                >
                  <span className="question-pick__body">
                    <span className="question-pick__text">{question.text}</span>
                    <span className={`badge badge--${question.type}`} style={{ alignSelf: 'flex-start' }}>
                      {t(questionTypeBadgeKey(question.type))}
                    </span>
                  </span>
                  <SelectionMark selected />
                </button>
              ))}

              <button
                type="button"
                className="question-pick question-pick--custom"
                onClick={() => setSheetOpen(true)}
              >
                <PlusIcon size={18} />
                {t('onboarding.questions.custom')}
              </button>
            </div>

            <p className="question-pick__count" aria-live="polite">
              {chosenQuestions.length > 0
                ? t('onboarding.questions.selected', { count: chosenQuestions.length })
                : t('onboarding.questions.recommendation')}
            </p>
          </div>

          <div className="onboarding__footer">
            <Button variant="primary" block onClick={() => go(1)}>
              {t('common.continue')}
            </Button>
            {chosenQuestions.length === 0 ? (
              <Button variant="quiet" block onClick={() => go(1)}>
                {t('common.skip')}
              </Button>
            ) : null}
          </div>

          <QuestionSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            onSubmit={(draft: { text: string; type: QuestionType }) => {
              setCustomQuestions((current) => [...current, draft]);
              setSheetOpen(false);
            }}
          />
        </>
      ) : null}

      {step === 'sports' ? (
        <>
          <div className="onboarding__body">
            <div>
              <h1 className="onboarding__title">{t('onboarding.sports.title')}</h1>
              <p className="onboarding__lead" style={{ marginTop: 8 }}>
                {t('onboarding.sports.body')}
              </p>
            </div>

            <div className="sports-step__stage">
              <div>
                <p className="sports-step__value" aria-hidden="true">
                  {sportsTarget ?? '–'}
                </p>
                {/* The numeral is the value; the line under it is the unit,
                    not the value again. */}
                <p className="sports-step__unit">
                  {sportsTarget === null
                    ? t('onboarding.sports.unitEmpty')
                    : t('onboarding.sports.unit')}
                </p>
              </div>

              <TargetPicker value={sportsTarget} onChange={(next) => setSportsTarget(next)} />
            </div>
          </div>

          <div className="onboarding__footer">
            <Button
              variant="primary"
              block
              onClick={() => {
                if (sportsTarget === null) setSportsTarget(SPORTS.DEFAULT_TARGET_PER_WEEK);
                go(1);
              }}
            >
              {t('common.continue')}
            </Button>
            <Button
              variant="quiet"
              block
              onClick={() => {
                setSportsTarget(null);
                go(1);
              }}
            >
              {t('onboarding.sports.skip')}
            </Button>
          </div>
        </>
      ) : null}

      {step === 'summary' ? (
        <>
          <div className="onboarding__body">
            <div>
              <h1 className="onboarding__title">
                {chosenQuestions.length === 0 && sportsTarget === null
                  ? t('onboarding.summary.empty')
                  : t('onboarding.summary.title')}
              </h1>
              <p className="onboarding__lead" style={{ marginTop: 8 }}>
                {chosenQuestions.length === 0 && sportsTarget === null
                  ? t('onboarding.summary.emptyBody')
                  : t('onboarding.summary.body')}
              </p>
            </div>

            <div className="summary__list">
              {chosenQuestions.length > 0 ? (
                <div className="summary__item">
                  <span className="summary__dot" style={{ background: 'var(--domain-mental)' }} />
                  {chosenQuestions.length === 1
                    ? t('onboarding.summary.questionsOne')
                    : t('onboarding.summary.questions', { count: chosenQuestions.length })}
                </div>
              ) : null}
              {sportsTarget !== null ? (
                <div className="summary__item">
                  <span className="summary__dot" style={{ background: 'var(--domain-sports)' }} />
                  {t('onboarding.summary.sports', { count: sportsTarget })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="onboarding__footer">
            <Button variant="primary" block onClick={() => finish(sportsTarget)}>
              {t('onboarding.summary.start')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
