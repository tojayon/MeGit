import { expect, it } from 'vitest';
import { relationLabelState } from '../src/lib/relation-status';

it.each([[0, 0, 'refsInSync'], [2, 0, 'targetAhead'], [0, 2, 'targetBehind'], [2, 2, 'diverged']])(
  'matches the displayed state for ahead=%i and behind=%i',
  (targetAhead, targetBehind, state) => {
    expect(relationLabelState('integration', {
      state: 'pending', divergence: { targetAhead, targetBehind },
    })).toBe(state);
  },
);
