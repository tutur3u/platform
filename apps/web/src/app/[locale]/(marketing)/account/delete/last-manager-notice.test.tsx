// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LastManagerNotice } from './last-manager-notice';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      'delete-account-last-manager':
        'Give another member member-management access, or delete the workspace first',
      'delete-account-last-manager-workspaces':
        'Workspaces that need another member manager',
    })[key] ?? key,
}));

afterEach(cleanup);

describe('LastManagerNotice', () => {
  it('shows the refusal sentence and every blocking workspace name', () => {
    render(
      <LastManagerNotice
        workspaces={[
          { id: 'team', name: 'Team' },
          { id: 'club', name: 'Chess Club' },
        ]}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Give another member member-management access, or delete the workspace first'
    );
    expect(
      screen.getByText('Workspaces that need another member manager')
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent)
    ).toEqual(['Team', 'Chess Club']);
  });
});
