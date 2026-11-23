// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useDefaultActivity } from './use-default-activity';

type Props = { live: boolean; activityId: string | null };

function mount(initial: Props) {
  const open = vi.fn();
  const hook = renderHook(
    (props: Props) => useDefaultActivity({ ...props, open }),
    { initialProps: initial }
  );
  return { open, rerender: hook.rerender };
}

it('opens the room default once the joiner is live', () => {
  const { open, rerender } = mount({ live: false, activityId: 'tool:live-qa' });
  expect(open).not.toHaveBeenCalled();
  rerender({ live: true, activityId: 'tool:live-qa' });
  expect(open).toHaveBeenCalledExactlyOnceWith('tool:live-qa');
  // Closing it or a later render does not reopen it.
  rerender({ live: true, activityId: 'tool:live-qa' });
  expect(open).toHaveBeenCalledOnce();
});

it('leaves people already in the call alone when the host changes it', () => {
  const { open, rerender } = mount({ live: true, activityId: null });
  rerender({ live: true, activityId: 'tool:polls' });
  expect(open).not.toHaveBeenCalled();
});
