import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./form', () => ({ default: () => null }));
vi.mock('@tuturuuu/ui/custom/modifiable-dialog-trigger', () => ({
  default: () => null,
}));

import { SecretRowActions } from './row-actions';

const secret = {
  id: 'secret-1',
  ws_id: 'workspace-1',
  name: 'EXAMPLE',
  value: 'false',
};

describe('Secret row actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes edit and delete controls for a persisted workspace secret', async () => {
    render(<SecretRowActions row={{ original: secret }} />);
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'common.open_menu' }),
      {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      }
    );
    expect(
      await screen.findByRole('menuitem', { name: 'common.edit' })
    ).toBeVisible();
    expect(
      screen.getByRole('menuitem', { name: 'common.delete' })
    ).toBeVisible();
  });

  it('does not offer mutations for a row without a workspace identity', () => {
    render(<SecretRowActions row={{ original: { id: 'secret-1' } }} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
