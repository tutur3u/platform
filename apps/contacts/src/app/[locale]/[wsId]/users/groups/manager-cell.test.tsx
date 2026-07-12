import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ManagerCell } from './manager-cell';

const labels = {
  linkedAll: 'All managers linked',
  linkedCount: '2/2 linked',
  linkedNone: 'No managers linked',
  linkedSome: 'Some managers linked',
  managers: 'Managers',
};

function manager(id: string, hasLinkedPlatformUser: boolean) {
  return {
    avatar_url: null,
    display_name: null,
    email: `${id}@example.com`,
    full_name: id,
    hasLinkedPlatformUser,
    id,
  };
}

describe('ManagerCell', () => {
  it('shows a green linked icon when all grouped managers are linked', () => {
    const { container } = render(
      <ManagerCell
        labels={labels}
        managers={[manager('A', true), manager('B', true)]}
        wsId="ws-1"
      />
    );

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'All managers linked: 2/2 linked'
    );
    expect(container.querySelector('.text-dynamic-green')).toBeTruthy();
  });

  it('shows a red unlinked icon when no grouped managers are linked', () => {
    const { container } = render(
      <ManagerCell
        labels={{ ...labels, linkedCount: '0/2 linked' }}
        managers={[manager('A', false), manager('B', false)]}
        wsId="ws-1"
      />
    );

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'No managers linked: 0/2 linked'
    );
    expect(container.querySelector('.text-dynamic-red')).toBeTruthy();
  });

  it('shows an amber linked icon when only some grouped managers are linked', () => {
    const { container } = render(
      <ManagerCell
        labels={{ ...labels, linkedCount: '1/2 linked' }}
        managers={[manager('A', true), manager('B', false)]}
        wsId="ws-1"
      />
    );

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Some managers linked: 1/2 linked'
    );
    expect(container.querySelector('.text-dynamic-amber')).toBeTruthy();
  });
});
