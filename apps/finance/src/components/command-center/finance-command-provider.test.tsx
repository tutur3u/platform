// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinanceCommandProvider } from './finance-command-provider';

const mocks = vi.hoisted(() => ({
  launcher: vi.fn((_props: Record<string, unknown>) => null),
  open: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/command-launcher', () => ({
  buildCommandLauncherLabels: () => ({ placeholder: 'shared' }),
  GlobalCommandLauncher: (props: Record<string, unknown>) =>
    mocks.launcher(props),
  openGlobalCommandLauncher: (...args: unknown[]) => mocks.open(...args),
}));
vi.mock('@tuturuuu/ui/finance/command/finance-command-sections', () => ({
  FinanceCommandSections: () => null,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderProvider() {
  return render(
    <>
      <input aria-label="Amount" />
      <FinanceCommandProvider
        canCreateTransactions
        workspaceSlug="ws-1"
        wsId="ws-1"
      />
    </>
  );
}

describe('FinanceCommandProvider', () => {
  it('contributes to the shared center instead of mounting its own dialog', () => {
    renderProvider();
    expect(mocks.launcher).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'finance',
        currentWorkspaceId: 'ws-1',
        instancePriority: 10,
      })
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('opens quick create in the shared center with bare C', () => {
    renderProvider();
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(mocks.open).toHaveBeenCalledWith({
      mode: 'quick-create',
      scope: 'actions',
    });
  });

  it('leaves C to editable fields and modified shortcuts', () => {
    const view = renderProvider();
    fireEvent.keyDown(view.getByLabelText('Amount'), { key: 'c' });
    fireEvent.keyDown(document.body, { ctrlKey: true, key: 'c' });
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
