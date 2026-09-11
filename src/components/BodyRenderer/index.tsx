import { useId } from 'react';
import { MUSCLE_GROUPS, type MuscleGroup } from '../../core/model';
import { useT } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n';
import './bodyRenderer.css';

/**
 * The body, as a map of muscle groups.
 *
 * **It calculates nothing.** Every value it draws arrives already computed by
 * `core/gym/performance.ts`; this file decides only where a shape sits and
 * what colour it takes. If a number here disagreed with the progress screen,
 * one of them would have to be re-deriving it, and neither does.
 *
 * The drawing is deliberately a *diagram* rather than an illustration.
 * Rounded blocks laid out on a torso read at 120px on a phone, stay legible
 * with ten of them lit at once, and are maintainable by anyone who can read a
 * rectangle. An anatomical rendering would look more impressive, cost far
 * more to keep correct, and imply a medical precision the app has no business
 * claiming.
 *
 * Front and back are one figure each, side by side, because eight of the ten
 * groups are unambiguous from one side and splitting them across a toggle
 * would hide half the answer behind a tap.
 */

export type MuscleState = 'noData' | 'awaitingBaseline' | 'improved' | 'unchanged' | 'declined';

export interface MuscleView {
  muscle: MuscleGroup;
  state: MuscleState;
  /** Optional short value, e.g. "+12 %". Shown in the legend, never inside. */
  detail?: string | null;
}

export const MUSCLE_LABEL_KEYS: Record<MuscleGroup, TranslationKey> = {
  chest: 'muscle.chest',
  back: 'muscle.back',
  shoulders: 'muscle.shoulders',
  biceps: 'muscle.biceps',
  triceps: 'muscle.triceps',
  core: 'muscle.core',
  quadriceps: 'muscle.quadriceps',
  hamstringsGlutes: 'muscle.hamstringsGlutes',
  calves: 'muscle.calves',
  forearms: 'muscle.forearms',
};

export const MUSCLE_STATE_KEYS: Record<MuscleState, TranslationKey> = {
  noData: 'muscle.state.noData',
  awaitingBaseline: 'muscle.state.awaitingBaseline',
  improved: 'muscle.state.improved',
  unchanged: 'muscle.state.unchanged',
  declined: 'muscle.state.declined',
};

/**
 * Where each group sits, and on which figure.
 *
 * Coordinates are in a 100 × 200 box per figure. A group may appear on both
 * figures — shoulders and forearms do — and both shapes carry the same state,
 * because they are one muscle group drawn twice rather than two.
 */
interface Shape {
  muscle: MuscleGroup;
  view: 'front' | 'back';
  d: string;
}

const SHAPES: Shape[] = [
  // ── Front ──────────────────────────────────────────────────────────────
  { muscle: 'shoulders', view: 'front', d: 'M22 52 q-8 4 -9 15 q9 4 15 -2 q2 -9 -6 -13 Z' },
  { muscle: 'shoulders', view: 'front', d: 'M78 52 q8 4 9 15 q-9 4 -15 -2 q-2 -9 6 -13 Z' },
  { muscle: 'chest', view: 'front', d: 'M31 54 q19 -6 38 0 l-2 20 q-17 6 -34 0 Z' },
  { muscle: 'biceps', view: 'front', d: 'M18 70 q-6 12 -4 24 q8 2 11 -6 q2 -11 -1 -18 Z' },
  { muscle: 'biceps', view: 'front', d: 'M82 70 q6 12 4 24 q-8 2 -11 -6 q-2 -11 1 -18 Z' },
  { muscle: 'core', view: 'front', d: 'M35 76 h30 l-2 32 q-13 4 -26 0 Z' },
  { muscle: 'forearms', view: 'front', d: 'M14 96 q-4 14 -1 26 q8 1 10 -7 q1 -12 -2 -19 Z' },
  { muscle: 'forearms', view: 'front', d: 'M86 96 q4 14 1 26 q-8 1 -10 -7 q-1 -12 2 -19 Z' },
  { muscle: 'quadriceps', view: 'front', d: 'M34 112 q13 4 25 0 l-3 44 q-9 3 -18 0 Z' },
  { muscle: 'calves', view: 'front', d: 'M38 160 q9 3 17 0 l-3 30 q-6 2 -11 0 Z' },

  // ── Back ───────────────────────────────────────────────────────────────
  { muscle: 'shoulders', view: 'back', d: 'M22 52 q-8 4 -9 15 q9 4 15 -2 q2 -9 -6 -13 Z' },
  { muscle: 'shoulders', view: 'back', d: 'M78 52 q8 4 9 15 q-9 4 -15 -2 q-2 -9 6 -13 Z' },
  { muscle: 'back', view: 'back', d: 'M31 54 q19 -6 38 0 l-4 40 q-15 5 -30 0 Z' },
  { muscle: 'triceps', view: 'back', d: 'M18 70 q-6 12 -4 24 q8 2 11 -6 q2 -11 -1 -18 Z' },
  { muscle: 'triceps', view: 'back', d: 'M82 70 q6 12 4 24 q-8 2 -11 -6 q-2 -11 1 -18 Z' },
  { muscle: 'forearms', view: 'back', d: 'M14 96 q-4 14 -1 26 q8 1 10 -7 q1 -12 -2 -19 Z' },
  { muscle: 'forearms', view: 'back', d: 'M86 96 q4 14 1 26 q-8 1 -10 -7 q-1 -12 2 -19 Z' },
  { muscle: 'hamstringsGlutes', view: 'back', d: 'M34 100 q13 5 25 0 l-3 56 q-9 3 -18 0 Z' },
  { muscle: 'calves', view: 'back', d: 'M38 160 q9 3 17 0 l-3 30 q-6 2 -11 0 Z' },
];

/** The body outline the muscle shapes sit on. Decorative, never selectable. */
const SILHOUETTE =
  'M50 8 q10 0 10 11 q0 8 -5 12 q14 3 22 12 q7 8 8 24 q1 14 -2 26 q-2 12 -6 22 ' +
  'q3 20 1 38 q-1 20 -4 38 q-1 8 -8 8 q-6 0 -7 -8 q-2 -18 -4 -34 q-2 -12 -5 -12 ' +
  'q-3 0 -5 12 q-2 16 -4 34 q-1 8 -7 8 q-7 0 -8 -8 q-3 -18 -4 -38 q-2 -18 1 -38 ' +
  'q-4 -10 -6 -22 q-3 -12 -2 -26 q1 -16 8 -24 q8 -9 22 -12 q-5 -4 -5 -12 q0 -11 10 -11 Z';

/**
 * Which halves to draw.
 *
 * `all` is what every existing caller gets and what this component has
 * always done: the two figures and the readable legend under them. The Gym
 * muscle module asks for one half at a time — the figure alone when it
 * stands in for the 3D body, the legend alone while its own rows are not
 * there yet — because two bodies or two lists of the same ten groups on one
 * screen say the same thing twice.
 */
export type BodyRendererParts = 'all' | 'figure' | 'legend';

export function BodyRenderer({
  muscles,
  selected = null,
  onSelect,
  size = 132,
  parts = 'all',
}: {
  muscles: readonly MuscleView[];
  selected?: MuscleGroup | null;
  /** Omit to render a picture rather than a control. */
  onSelect?: (muscle: MuscleGroup) => void;
  size?: number;
  parts?: BodyRendererParts;
}) {
  const t = useT();
  const uid = useId().replace(/:/g, '');
  const byMuscle = new Map(muscles.map((entry) => [entry.muscle, entry]));
  const stateOf = (muscle: MuscleGroup): MuscleState => byMuscle.get(muscle)?.state ?? 'noData';

  const figure = (view: 'front' | 'back') => (
    <svg
      width={size}
      height={size * 2}
      viewBox="0 0 100 200"
      fill="none"
      /* The figure is a picture of the table underneath it. Announcing ten
         paths twice would say the same thing at twice the length, and the
         table is the version that can be read cell by cell. */
      aria-hidden="true"
      className="body-renderer__figure"
    >
      <path d={SILHOUETTE} className="body-renderer__silhouette" />
      {SHAPES.filter((shape) => shape.view === view).map((shape, index) => {
        const state = stateOf(shape.muscle);
        const isSelected = selected === shape.muscle;
        return (
          <path
            key={`${uid}-${view}-${index}`}
            d={shape.d}
            className={`body-renderer__muscle body-renderer__muscle--${state} ${
              isSelected ? 'body-renderer__muscle--selected' : ''
            }`.trim()}
          />
        );
      })}
    </svg>
  );

  return (
    <div className="body-renderer">
      {parts === 'legend' ? null : (
        <div className="body-renderer__figures">
          {figure('front')}
          {figure('back')}
        </div>
      )}

      {/*
        The readable half. Every group, its state in words, and the value where
        there is one — so the answer to "which muscles are improving" never
        depends on telling two fills apart.
      */}
      {parts === 'figure' ? null : (
      <ul className="body-renderer__legend">
        {MUSCLE_GROUPS.map((muscle) => {
          const entry = byMuscle.get(muscle);
          const state = entry?.state ?? 'noData';
          const label = t(MUSCLE_LABEL_KEYS[muscle]);
          const stateLabel = t(MUSCLE_STATE_KEYS[state]);
          const detail = entry?.detail;
          const content = (
            <>
              <span
                className={`body-renderer__swatch body-renderer__swatch--${state}`}
                aria-hidden="true"
              />
              <span className="body-renderer__name">{label}</span>
              <span className={`body-renderer__state body-renderer__state--${state}`}>
                {detail ? `${stateLabel} · ${detail}` : stateLabel}
              </span>
            </>
          );

          return (
            <li key={muscle} className="body-renderer__row">
              {onSelect ? (
                <button
                  type="button"
                  className="body-renderer__button"
                  aria-pressed={selected === muscle}
                  onClick={() => onSelect(muscle)}
                >
                  {content}
                </button>
              ) : (
                <span className="body-renderer__button body-renderer__button--static">
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
