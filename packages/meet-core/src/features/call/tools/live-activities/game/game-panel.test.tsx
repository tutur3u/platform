// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../panel-frame', () => ({
  LiveActivityPanelFrame: ({
    title,
    children,
  }: {
    title: string;
    children: ReactNode;
  }) => (
    <div>
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

import { GamePanel } from './game-panel';

afterEach(() => {
  cleanup();
});

it('shows the stored round after each start', () => {
  render(<GamePanel />);
  expect(screen.getByText('Round 0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Start round/i }));
  expect(screen.getByText('Round 1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Start round/i }));
  expect(screen.getByText('Round 2')).toBeTruthy();
});
