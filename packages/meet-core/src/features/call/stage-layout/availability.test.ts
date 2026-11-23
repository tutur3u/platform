import { describe, expect, it } from 'vitest';
import { allowedToolIds, isActivityAvailable } from './availability';

const base = { live: true, collaboration: true, classroom: true };

describe('stage availability', () => {
  it('allows the tools a person may browse, the live shortcuts and nothing else', () => {
    const toolIds = allowedToolIds(['live-qa', 'live-game'], []);
    const available = (id: string) =>
      isActivityAvailable(id, { ...base, toolIds });
    expect(available('tool:live-qa')).toBe(true);
    expect(available('tool:polls')).toBe(true);
    expect(available('tool:quiz')).toBe(true);
    expect(available('tool:live-assessment')).toBe(false);
  });

  it('offers the saved whiteboard wherever Co-Programming and the document are offered', () => {
    expect(isActivityAvailable('board', { ...base, toolIds: [] })).toBe(true);
    expect(
      isActivityAvailable('board', {
        ...base,
        collaboration: false,
        toolIds: [],
      })
    ).toBe(false);
  });

  it('drops a host-only tool when the person is demoted, even from a saved layout', () => {
    const host = allowedToolIds(['live-qa', 'live-game', 'timers'], []);
    const participant = allowedToolIds([], []);
    expect(
      isActivityAvailable('tool:live-game', { ...base, toolIds: host })
    ).toBe(true);
    expect(
      isActivityAvailable('tool:live-game', { ...base, toolIds: participant })
    ).toBe(false);
    expect(
      isActivityAvailable('tool:timers', { ...base, toolIds: participant })
    ).toBe(false);
  });

  it('keeps a tool a host opened for the person for the session only', () => {
    const summoned = allowedToolIds([], ['tool:live-game']);
    expect(
      isActivityAvailable('tool:live-game', { ...base, toolIds: summoned })
    ).toBe(true);
    // A fresh session has no summons.
    expect(
      isActivityAvailable('tool:live-game', {
        ...base,
        toolIds: allowedToolIds([], []),
      })
    ).toBe(false);
  });

  it('gates collaboration, classroom tools and a call that is not live', () => {
    const toolIds = allowedToolIds(['live-qa'], []);
    expect(
      isActivityAvailable('programming', {
        ...base,
        collaboration: false,
        toolIds,
      })
    ).toBe(false);
    expect(
      isActivityAvailable('whiteboard', { ...base, classroom: false, toolIds })
    ).toBe(false);
    expect(
      isActivityAvailable('tool:live-qa', { ...base, live: false, toolIds })
    ).toBe(false);
    expect(isActivityAvailable('unknown', { ...base, toolIds })).toBe(false);
  });
});
