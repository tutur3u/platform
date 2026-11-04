import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardSprintSettings } from '../board-sprint-settings';

const sprints = vi.hoisted(() => ({ cyclesEnabled: false }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../shared/board-sprints/use-board-sprints', () => ({
  useBoardSprints: () => ({
    cyclesEnabled: sprints.cyclesEnabled,
    isError: false,
    isLoading: false,
    schemaAvailable: true,
    sprintLengthWeeks: null,
  }),
  useBoardSprintMutations: () => ({
    setLength: { isPending: false, mutate: vi.fn() },
  }),
}));

describe('BoardSprintSettings', () => {
  beforeEach(() => {
    sprints.cyclesEnabled = false;
  });

  it('stays hidden until board cycles are enabled for the workspace', () => {
    const { container } = render(
      <BoardSprintSettings boardId="board" wsId="ws" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the sprint length toggle once board cycles are enabled', () => {
    sprints.cyclesEnabled = true;
    render(<BoardSprintSettings boardId="board" wsId="ws" />);
    expect(screen.getByText('settings_title')).toBeInTheDocument();
  });
});
