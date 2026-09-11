import { describe, expect, it } from 'vitest';
import { regionTargets } from './useMuscleHighlight';
import { BODY_BASE_COLOR, NEUTRAL_HIGHLIGHT, REGION_MATERIAL, STATE_COLOR, stateIntensity } from './tokens';

/**
 * The one rule that is easy to get wrong: a group with nothing to report
 * must still look chosen when it is chosen.
 */
describe('regionTargets', () => {
  const untrained = { tint: STATE_COLOR.noData.ink, intensity: stateIntensity('noData', 0) };
  const improved = { tint: STATE_COLOR.improved.ink, intensity: stateIntensity('improved', 12) };

  it('an untrained group is plain grey and draws no attention', () => {
    expect(regionTargets(untrained, false)).toEqual({
      color: BODY_BASE_COLOR, emissive: '#000000', emissiveIntensity: 0, rim: 0, rimColor: '#000000',
    });
  });

  it('and selecting it shows the neutral cue without inventing a result', () => {
    const target = regionTargets(untrained, true);
    expect(target.color).toBe(BODY_BASE_COLOR);            // still grey, still noData
    expect(target.emissive).toBe(NEUTRAL_HIGHLIGHT);       // never a state colour
    expect(target.rimColor).toBe(NEUTRAL_HIGHLIGHT);
    expect(target.rim).toBeGreaterThan(0);
    expect(target.emissiveIntensity).toBeGreaterThan(0);
  });

  it('a group with no visual at all behaves the same way', () => {
    expect(regionTargets(undefined, true).rimColor).toBe(NEUTRAL_HIGHLIGHT);
    expect(regionTargets(undefined, false).rim).toBe(0);
  });

  it('a measured group is tinted with its state, more so when selected', () => {
    const resting = regionTargets(improved, false);
    const chosen = regionTargets(improved, true);
    expect(resting.emissive).toBe(STATE_COLOR.improved.ink);
    expect(chosen.rimColor).toBe(STATE_COLOR.improved.ink);
    expect(chosen.rim).toBe(REGION_MATERIAL.selected.rim);
    expect(chosen.emissiveIntensity).toBeGreaterThan(resting.emissiveIntensity);
    expect(chosen.color).not.toBe(resting.color);
    expect(chosen.color).not.toBe(BODY_BASE_COLOR);
  });

  it('with tinting off every group falls back to the neutral treatment', () => {
    expect(regionTargets(improved, true, false).rimColor).toBe(NEUTRAL_HIGHLIGHT);
    expect(regionTargets(improved, false, false).color).toBe(BODY_BASE_COLOR);
  });
});
