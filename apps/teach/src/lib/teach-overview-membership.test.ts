import { renderToReadableStream } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { access, props } from './teach-membership.fixture';
import './teach-page-ui.fixture';

it('renders the education overview for an ai_lab-only member without restricted statistic cards', async () => {
  access.withoutPermission.mockImplementation(
    (permission: string) => permission !== 'ai_lab'
  );
  access.contentRead.mockImplementation(() => {
    throw new Error('PROTECTED_DATA_READ');
  });
  access.client.mockImplementation(() => ({
    storage: { from: access.contentRead },
    from: (table: string) => {
      if (table === 'workspace_secrets') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: access.educationFlag }) }),
          }),
        };
      }
      if (table !== 'workspace_flashcards')
        throw new Error(`UNAUTHORIZED_STATISTIC_READ: ${table}`);
      return { select: () => ({ eq: async () => ({ count: 3 }) }) };
    },
  }));
  const { default: overview } = await import(
    '@/app/[locale]/(dashboard)/[wsId]/education/(dashboard)/page'
  );
  const errors: unknown[] = [];
  const stream = await renderToReadableStream(await overview(props), {
    onError: (error: unknown) => {
      errors.push(error);
    },
  });
  await stream.allReady;
  const html = await new Response(stream).text();
  expect(errors).toEqual([]);
  expect(html).toContain('sidebar_tabs.education');
  expect(html).toContain(
    'data-statistic="workspace-education-tabs.flashcards"'
  );
  expect(html).not.toContain(
    'data-statistic="workspace-education-tabs.courses"'
  );
  expect(html).not.toContain(
    'data-statistic="workspace-education-tabs.quizzes"'
  );
});

it('resolves the gate once per overview request while preserving every card permission check', async () => {
  const countRead = vi.fn(async () => ({ count: 3 }));
  access.client.mockImplementation(() => ({
    from: (table: string) =>
      table === 'workspace_secrets'
        ? {
            select: () => ({
              eq: () => ({ eq: () => ({ maybeSingle: access.educationFlag }) }),
            }),
          }
        : { select: () => ({ eq: countRead }) },
  }));
  const { default: overview } = await import(
    '@/app/[locale]/(dashboard)/[wsId]/education/(dashboard)/page'
  );
  for (let request = 1; request <= 2; request++) {
    const errors: unknown[] = [];
    const stream = await renderToReadableStream(await overview(props), {
      onError: (error: unknown) => {
        errors.push(error);
      },
    });
    await stream.allReady;
    const html = await new Response(stream).text();
    expect(errors).toEqual([]);
    for (const card of ['courses', 'flashcards', 'quizzes']) {
      expect(html).toContain(
        `data-statistic="workspace-education-tabs.${card}"`
      );
    }
    expect(access.permissions).toHaveBeenCalledTimes(request);
    expect(access.actor).toHaveBeenCalledTimes(request);
    expect(access.membership).toHaveBeenCalledTimes(request);
    expect(access.educationFlag).toHaveBeenCalledTimes(request);
    expect(countRead).toHaveBeenCalledTimes(3 * request);
    for (const permission of [
      'ai_lab',
      'view_user_groups',
      'update_user_groups',
    ]) {
      expect(access.withoutPermission).toHaveBeenCalledWith(permission);
    }
  }
});
