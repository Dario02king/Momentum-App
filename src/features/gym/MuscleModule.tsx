import { Suspense, useMemo } from 'react';
import type { MuscleGroup } from '../../core/model';
import { BodyRenderer, type MuscleView } from '../../components/BodyRenderer';
import type { MusclePerformance } from '../../core/gym/performance';
import { BodyViewer, toBodyVisuals, visualsByMuscle } from '../body';
import './muscleModule.css';

/**
 * Muskelgruppen: the body and the per-group rows, as one module.
 *
 * **It owns no selection.** The Gym screen holds the one selected group and
 * hands it here; the 3D body, the fallback figure and the rows all read that
 * one value and all report back through `onSelect`, so the body, the row and
 * the exercise list below can never disagree about what is selected.
 *
 * It computes nothing either: the visuals are `toBodyVisuals()` over the
 * `MusclePerformance` values the screen already loaded for its range.
 *
 * The 3D body is behind `React.lazy` (`features/body/index.ts`), so three.js
 * reaches a device only when this module actually renders — entering Mental
 * or Ernährung never fetches it. Where WebGL is missing or the model cannot
 * be loaded, the viewer renders the existing SVG figure instead, driven by
 * the same states and the same selection.
 */
export function MuscleModule({
  muscles,
  views,
  selected,
  onSelect,
}: {
  /** Already derived by the Gym domain for the range on screen. */
  muscles: readonly MusclePerformance[];
  /** The same groups in the SVG figure's shape, for the fallback. */
  views: readonly MuscleView[];
  selected: MuscleGroup | null;
  onSelect: (muscle: MuscleGroup) => void;
}) {
  const visuals = useMemo(() => visualsByMuscle(toBodyVisuals(muscles)), [muscles]);

  // One figure, whichever way it is drawn: the SVG stands in for the canvas
  // rather than sitting beside it.
  const figure = (
    <div className="muscle-module__figure">
      <BodyRenderer muscles={views} parts="figure" selected={selected} size={132} />
    </div>
  );

  return (
    <div className="muscle-module">
      {/* The placeholder holds the body's box, so the card does not jump
          when the chunk arrives. */}
      <Suspense fallback={<div className="muscle-module__placeholder" aria-hidden="true" />}>
        <BodyViewer
          visuals={visuals}
          selectedMuscle={selected}
          onSelectMuscle={onSelect}
          fallback={figure}
        />
      </Suspense>

      {/* Stage 4a: the existing legend stands in for the analytics rows,
          which arrive with their sparklines in 4b. */}
      <BodyRenderer muscles={views} parts="legend" selected={selected} onSelect={onSelect} />
    </div>
  );
}
