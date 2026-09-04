import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualTaskOrderingDialog } from './manual-task-ordering-dialog';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

describe('ManualTaskOrderingDialog', () => {
  const onEnableManualOrdering = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    onEnableManualOrdering.mockReset();
    onOpenChange.mockReset();
  });

  it('explains why the attempted arrangement is unavailable', () => {
    render(
      <ManualTaskOrderingDialog
        open
        onEnableManualOrdering={onEnableManualOrdering}
        onOpenChange={onOpenChange}
      />
    );

    expect(
      screen.getByText('ws-task-boards.manual_ordering_disabled.title')
    ).toBeVisible();
    expect(
      screen.getByText('ws-task-boards.manual_ordering_disabled.description')
    ).toBeVisible();
  });

  it('switches to manual ordering and closes immediately', () => {
    render(
      <ManualTaskOrderingDialog
        open
        onEnableManualOrdering={onEnableManualOrdering}
        onOpenChange={onOpenChange}
      />
    );

    fireEvent.click(
      screen.getByText('ws-task-boards.manual_ordering_disabled.use_manual')
    );

    expect(onEnableManualOrdering).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('allows keeping the current criteria sorting', () => {
    render(
      <ManualTaskOrderingDialog
        open
        onEnableManualOrdering={onEnableManualOrdering}
        onOpenChange={onOpenChange}
      />
    );

    fireEvent.click(
      screen.getByText('ws-task-boards.manual_ordering_disabled.keep_sorting')
    );

    expect(onEnableManualOrdering).not.toHaveBeenCalled();
  });
});
