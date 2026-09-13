import { useEffect, useState } from 'react';
import type { ExerciseRecord, TrainingPlanRecord } from '../../core/model';
import { Button, Card, Section } from '../../components';
import { ChevronLeftIcon, MinusIcon, PlusIcon } from '../../components/Icons';
import { useT } from '../../i18n/I18nProvider';
import {
  createExercise,
  ensureExerciseCatalogue,
  type NewExerciseInput,
} from '../../storage/services/gymService';
import type { PlanDraftInput, PlanSlots } from '../../storage/services/trainingPlanService';
import { ExercisePicker } from './ExercisePicker';
import { useExerciseNamer } from './exerciseNames';
import './gym.css';

/**
 * Building or changing one training plan.
 *
 * A name and an ordered list, nothing else: no days per week, no goal, no
 * volume — a plan is what the user trains together, and the rest of the
 * app already knows how often they train. Reordering is two buttons per
 * line rather than a drag, because a drag has no keyboard and no screen
 * reader; the buttons name the exercise they move.
 *
 * The editor is a plain component with no route of its own, so the same
 * editor can be hosted from the Gym workspace today and from onboarding
 * later (WP2-4) — never a second, onboarding-only copy.
 */
interface Line {
  exerciseId: string;
  /** The stored name, for the snapshot. Display goes through the catalogue. */
  name: string;
}

export function PlanEditor({
  plan,
  slots,
  onSave,
  onCancel,
  onDuplicate,
  onDelete,
}: {
  /** `null` creates a new plan. */
  plan: TrainingPlanRecord | null;
  slots: PlanSlots;
  onSave(input: PlanDraftInput): void;
  onCancel(): void;
  onDuplicate?(): void;
  onDelete?(): void;
}) {
  const t = useT();
  const namer = useExerciseNamer();
  const [name, setName] = useState(plan?.name ?? '');
  const [lines, setLines] = useState<Line[]>(
    () =>
      [...(plan?.exercises ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((line) => ({ exerciseId: line.exerciseId, name: line.name })),
  );
  const [picking, setPicking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);

  useEffect(() => {
    void ensureExerciseCatalogue().then(setExercises);
  }, []);

  const move = (index: number, delta: number) =>
    setLines((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [line] = next.splice(index, 1);
      next.splice(target, 0, line!);
      return next;
    });

  const remove = (index: number) =>
    setLines((current) => current.filter((_, position) => position !== index));

  const add = (exercise: ExerciseRecord) => {
    setPicking(false);
    setLines((current) => [...current, { exerciseId: exercise.id, name: exercise.name }]);
  };

  const createAndAdd = (input: NewExerciseInput) => {
    setPicking(false);
    void createExercise(input).then(async (exercise) => {
      setExercises(await ensureExerciseCatalogue());
      add(exercise);
    });
  };

  const valid = name.trim().length > 0 && lines.length > 0;

  return (
    <div className="screen gym-session plan-editor">
      <header className="screen__header gym-session__header">
        <button
          type="button"
          className="button button--quiet gym-session__back"
          onClick={onCancel}
          aria-label={t('common.back')}
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="screen__title">{plan ? t('plans.editor.edit') : t('plans.editor.new')}</h1>
      </header>

      <div className="gym-session__scroll">
        {plan ? null : <p className="plan-editor__hint">{t('plans.hint')}</p>}

        <Card>
          <label className="field-label" htmlFor="plan-name">
            {t('plans.editor.name')}
          </label>
          <input
            id="plan-name"
            className="field"
            value={name}
            placeholder={t('plans.editor.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            maxLength={60}
          />
        </Card>

        <Section label={t('plans.editor.exercises')}>
          <Card>
            {lines.length === 0 ? (
              <p className="gym-picker__empty">{t('plans.editor.noExercises')}</p>
            ) : (
              <ol className="plan-editor__list">
                {lines.map((line, index) => {
                  const label = namer.name(line.exerciseId, line.name);
                  const detail = namer.detail(line.exerciseId);
                  return (
                    <li key={`${line.exerciseId}-${index}`} className="plan-editor__line">
                      <span className="plan-editor__number" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className="plan-editor__body">
                        <span className="plan-editor__name">{label}</span>
                        {detail ? <span className="plan-editor__detail">{detail}</span> : null}
                      </span>
                      <span className="plan-editor__controls">
                        <button
                          type="button"
                          className="plan-editor__control"
                          aria-label={t('plans.editor.moveUp', { exercise: label })}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <span aria-hidden="true">↑</span>
                        </button>
                        <button
                          type="button"
                          className="plan-editor__control"
                          aria-label={t('plans.editor.moveDown', { exercise: label })}
                          disabled={index === lines.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <span aria-hidden="true">↓</span>
                        </button>
                        <button
                          type="button"
                          className="plan-editor__control plan-editor__control--remove"
                          aria-label={t('plans.editor.remove', { exercise: label })}
                          onClick={() => remove(index)}
                        >
                          <MinusIcon size={16} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <button type="button" className="gym-exercise__add" onClick={() => setPicking(true)}>
              <PlusIcon size={18} />
              {t('plans.editor.add')}
            </button>
          </Card>
        </Section>

        <Button
          variant="primary"
          block
          disabled={!valid}
          onClick={() => onSave({ name, exercises: lines })}
        >
          {t('plans.editor.save')}
        </Button>

        {plan && onDuplicate ? (
          <>
            <Button variant="secondary" block disabled={!slots.free} onClick={onDuplicate}>
              {t('plans.editor.duplicate')}
            </Button>
            {!slots.free ? (
              <p className="plan-editor__limit" role="status">
                {t('plans.limit', { max: slots.max })}
              </p>
            ) : null}
          </>
        ) : null}

        {plan && onDelete ? (
          confirmingDelete ? (
            <div className="plan-editor__deleteConfirm">
              <p className="plan-editor__deleteNote">{t('plans.editor.deleteNote')}</p>
              <Button variant="destructive" block onClick={onDelete}>
                {t('plans.editor.deleteConfirm')}
              </Button>
              <Button variant="quiet" block onClick={() => setConfirmingDelete(false)}>
                {t('plans.editor.cancel')}
              </Button>
            </div>
          ) : (
            <Button variant="quiet" block onClick={() => setConfirmingDelete(true)}>
              {t('plans.editor.delete')}
            </Button>
          )
        ) : null}
      </div>

      <ExercisePicker
        open={picking}
        exercises={exercises}
        onClose={() => setPicking(false)}
        onPick={add}
        onCreate={createAndAdd}
      />
    </div>
  );
}
