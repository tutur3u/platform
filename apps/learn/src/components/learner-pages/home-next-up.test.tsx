import { cleanup, render, screen } from '@testing-library/react';
import type { TulearnCourseSummary } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';
import { HomeNextUp, selectCourseToResume } from './home-next-up';

afterEach(cleanup);

const course = (
  id: string,
  completedModules: number
): TulearnCourseSummary => ({
  id,
  name: id,
  description: null,
  completedModules,
  totalModules: 4,
  progress: completedModules * 25,
});

it('prefers a course already in progress over an unstarted course', () => {
  const unstarted = course('unstarted', 0);
  const active = course('active', 2);
  const finished = course('finished', 4);

  expect(selectCourseToResume([finished, unstarted, active])).toBe(active);
  expect(selectCourseToResume([finished, unstarted])).toBe(unstarted);
  expect(selectCourseToResume([finished])).toBeUndefined();
});

it('preserves the linked learner and excludes completed work from next up', () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <HomeNextUp
        assignments={[
          {
            id: 'completed',
            title: 'Completed essay',
            course: { id: 'geometry', name: 'Geometry' },
            content: null,
            created_at: '',
            is_completed: true,
          },
          {
            id: 'assessment',
            title: 'Unit review',
            course: { id: 'geometry', name: 'Geometry' },
            content: null,
            created_at: '',
            is_completed: false,
            is_test: true,
          },
        ]}
        course={course('geometry', 2)}
        studentId="linked&learner"
        wsId="workspace"
      />
    </NextIntlClientProvider>
  );

  expect(screen.getByRole('heading', { name: 'Next up' })).toBeTruthy();
  expect(screen.queryByText('Completed essay')).toBeNull();
  expect(
    screen.getByRole('link', { name: /Unit review/ }).getAttribute('href')
  ).toBe(
    '/workspace/courses/geometry/tests/assessment?studentId=linked%26learner'
  );
  expect(
    screen
      .getByRole('link', { name: en.home.continueCourse })
      .getAttribute('href')
  ).toBe('/workspace/courses/geometry?studentId=linked%26learner');
  expect(
    screen
      .getByRole('progressbar', { name: 'Learning path' })
      .getAttribute('aria-valuenow')
  ).toBe('50');
  expect(screen.getByText('2 of 4 modules complete')).toBeTruthy();
});

it('renders a localized empty state with useful navigation', () => {
  render(
    <NextIntlClientProvider locale="vi" messages={vi} timeZone="UTC">
      <HomeNextUp assignments={[]} studentId={null} wsId="workspace" />
    </NextIntlClientProvider>
  );

  expect(screen.getByRole('heading', { name: 'Tiếp theo' })).toBeTruthy();
  expect(screen.getByText('Không có bài tập đang chờ.')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(
    screen.getByRole('link', { name: vi.courses.title }).getAttribute('href')
  ).toBe('/workspace/courses');
});
