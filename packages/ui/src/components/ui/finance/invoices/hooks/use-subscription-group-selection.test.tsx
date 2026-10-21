import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useSubscriptionGroupSelection } from './use-subscription-group-selection';

const scheduled = ['class-a', 'class-b'];
function useSelection({
  wsId,
  userId,
  loading = false,
}: {
  wsId: string;
  userId: string;
  loading?: boolean;
}) {
  const [selected, onChange] = useState<string[]>([]);
  const controls = useSubscriptionGroupSelection({
    wsId,
    userId,
    loading,
    selectedGroupIds: selected,
    groupsWithScheduleIds: scheduled,
    onChange,
  });
  return { selected, ...controls };
}

describe('subscription group selection scope', () => {
  it('waits for membership and keeps explicit empty selection through refetches', () => {
    const { result, rerender } = renderHook(useSelection, {
      initialProps: { wsId: 'ws', userId: 'customer', loading: true },
    });
    expect(result.current.selected).toEqual([]);
    rerender({ wsId: 'ws', userId: 'customer', loading: false });
    expect(result.current.selected).toEqual(scheduled);
    act(() => result.current.deselectAll());
    expect(result.current.selected).toEqual([]);
    rerender({ wsId: 'ws', userId: 'customer', loading: true });
    rerender({ wsId: 'ws', userId: 'customer', loading: false });
    expect(result.current.selected).toEqual([]);
  });

  it.each(['workspace', 'customer'])(
    'reinitializes untouched defaults when changing %s',
    (kind) => {
      const { result, rerender } = renderHook(useSelection, {
        initialProps: { wsId: 'ws', userId: 'customer' },
      });
      act(() => result.current.deselectAll());
      expect(result.current.selected).toEqual([]);
      const changed =
        kind === 'workspace'
          ? { wsId: 'other', userId: 'customer' }
          : { wsId: 'ws', userId: 'other' };
      rerender(changed);
      expect(result.current.selected).toEqual(scheduled);
      act(() => result.current.deselectAll());
      rerender({ wsId: 'ws', userId: 'customer' });
      expect(result.current.selected).toEqual(scheduled);
    }
  );
});
