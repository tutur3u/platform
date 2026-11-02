import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import messages from '../../../../../../messages/en.json';
import { TutoringStudentPanel } from './tutoring-student-panel';

vi.mock('@tuturuuu/internal-api/tutoring', () => ({
  getTutoringStudentView: async () => ({
    noShows: 2,
    classAbsences: 3,
    sessions: [],
  }),
}));
it('renders two separately labelled absence counts', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TutoringStudentPanel
          wsId="fixture"
          studentUserId="learner"
          commentsEnabled={false}
          currentGroupIds={[]}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  expect(await screen.findByText('Tutoring no-shows')).toBeInTheDocument();
  expect(screen.getByText('Class absences')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByText('3')).toBeInTheDocument();
});
