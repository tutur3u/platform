import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TulearnAssignmentSummary } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import { AssignmentBoard } from './assignments-page';

vi.mock('@tuturuuu/internal-api', () => ({
  completeTulearnAssignment: vi.fn(),
  listTulearnAssignments: vi.fn(),
}));

vi.mock('gsap', () => ({ default: { registerPlugin: vi.fn() } }));

afterEach(cleanup);

const work: TulearnAssignmentSummary[] = [
  {
    id: 'open',
    title: 'Open worksheet',
    content: null,
    created_at: '',
    course: { id: 'geometry', name: 'Geometry' },
    is_completed: false,
  },
  {
    id: 'submitted',
    title: 'Submitted assessment',
    content: null,
    created_at: '',
    course: { id: 'geometry', name: 'Geometry' },
    is_completed: true,
    is_test: true,
  },
];

function showBoard(readOnly: boolean, completionPending = false) {
  const complete = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AssignmentBoard
        assignments={work}
        complete={complete}
        completionFailed={false}
        completionPending={completionPending}
        readOnly={readOnly}
        studentId="linked&learner"
        wsId="center"
      />
    </NextIntlClientProvider>
  );
  return complete;
}

it('groups completed work separately and keeps the selected learner on review links', () => {
  showBoard(true);
  expect(screen.getByText('Open worksheet')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: en.assignments.markDone })
  ).toBeNull();
  expect(screen.queryByText('Submitted assessment')).toBeNull();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Completed/ }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByText('Submitted assessment')).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: en.courses.reviewTest })
      .getAttribute('href')
  ).toBe('/center/courses/geometry/tests/submitted?studentId=linked%26learner');
});

it('passes the id of the open assignment to the existing completion action', () => {
  const complete = showBoard(false);
  fireEvent.click(
    screen.getByRole('button', { name: en.assignments.markDone })
  );
  expect(complete).toHaveBeenCalledExactlyOnceWith('open');
});

it('blocks another completion submission while a request is in progress', () => {
  const complete = showBoard(false, true);
  fireEvent.click(
    screen.getByRole('button', { name: en.assignments.markDone })
  );
  expect(complete).not.toHaveBeenCalled();
});
