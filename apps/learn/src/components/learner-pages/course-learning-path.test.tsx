import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TulearnCourseDetail } from '@tuturuuu/internal-api';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import {
  CourseLearningPath,
  getNextCourseModule,
} from './course-learning-path';

afterEach(cleanup);

type CourseModule = TulearnCourseDetail['modules'][number];

function lesson(id: string, fields: Partial<CourseModule> = {}): CourseModule {
  return {
    id,
    name: id,
    counts: { flashcards: 0, quizzes: 0, quizSets: 0 },
    completed: false,
    locked: false,
    is_published: true,
    sort_key: 0,
    ...fields,
  };
}

it('picks the first unfinished lesson permitted by the course outline', () => {
  const modules = [
    lesson('Completed lesson', { completed: true }),
    lesson('Draft', { is_published: false }),
    lesson('Locked lesson', { locked: true }),
    lesson('Ready lesson'),
    lesson('Another lesson'),
  ];
  expect(getNextCourseModule(modules)?.id).toBe('Ready lesson');

  const onOpenModule = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CourseLearningPath
        course={{ completedModules: 1, modules, progress: 20, totalModules: 5 }}
        onOpenModule={onOpenModule}
      />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('region', { name: 'Course outline' })).toBeTruthy();
  expect(
    screen
      .getByRole('progressbar', { name: 'Learning path' })
      .getAttribute('aria-valuenow')
  ).toBe('20');
  fireEvent.click(screen.getByRole('button', { name: /Draft/ }));
  fireEvent.click(screen.getByRole('button', { name: /Locked lesson/ }));
  expect(onOpenModule).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Resume lesson' }));
  expect(onOpenModule).toHaveBeenCalledExactlyOnceWith('Ready lesson');
});

it('omits the resume action once all released modules are complete', () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CourseLearningPath
        course={{
          completedModules: 1,
          modules: [lesson('Completed lesson', { completed: true })],
          progress: 100,
          totalModules: 1,
        }}
        onOpenModule={vi.fn()}
      />
    </NextIntlClientProvider>
  );
  expect(screen.queryByRole('button', { name: 'Resume lesson' })).toBeNull();
  expect(screen.getByRole('button', { name: /Completed lesson/ })).toBeTruthy();
});
