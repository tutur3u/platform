import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemberAccessSummary } from './member-access-summary';

describe('MemberAccessSummary', () => {
  it('shows the permission and folds the rest into a count', () => {
    render(
      <MemberAccessSummary
        details={[
          { id: 'creator', label: 'Creator' },
          { id: 'role-1', label: 'Administrator' },
          { id: 'membership', label: 'Workspace member' },
        ]}
        permissionLabel="Can edit"
        permissionTone="edit"
        srLabel="Võ Hoàng Phúc"
      />
    );

    expect(screen.getByText('Can edit')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('keeps the folded detail reachable without hovering', () => {
    // Hover-only detail is unreachable by keyboard and screen readers, so the
    // trigger carries the full summary as its accessible name.
    render(
      <MemberAccessSummary
        details={[
          { id: 'creator', label: 'Creator' },
          { id: 'role-1', label: 'Administrator' },
        ]}
        permissionLabel="Can edit"
        srLabel="Võ Hoàng Phúc"
      />
    );

    expect(
      screen.getByRole('button', {
        name: 'Võ Hoàng Phúc: Can edit · Creator · Administrator',
      })
    ).toBeInTheDocument();
  });

  it('renders a plain badge when there is nothing to fold', () => {
    render(
      <MemberAccessSummary
        details={[]}
        permissionLabel="Can view"
        srLabel="Guest"
      />
    );

    expect(screen.getByText('Can view')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
