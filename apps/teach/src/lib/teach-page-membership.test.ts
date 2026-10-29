import { describe, expect, it, vi } from 'vitest';
import { access, props, wsId } from './teach-membership.fixture';
import './teach-page-ui.fixture';

const boundaries = [
  {
    name: 'education/(dashboard)/page.tsx',
    load: () =>
      import('@/app/[locale]/(dashboard)/[wsId]/education/(dashboard)/page'),
    permission: 'ai_lab',
    readsData: false,
  },
  {
    name: 'education/attempts/[attemptId]/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/attempts/[attemptId]/page'
      ),
    permission: 'view_user_groups_reports',
    readsData: true,
  },
  {
    name: 'education/attempts/page.tsx',
    load: () =>
      import('@/app/[locale]/(dashboard)/[wsId]/education/attempts/page'),
    permission: 'view_user_groups_reports',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/builder/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/builder/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/layout.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/layout'
      ),
    permission: 'view_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/content/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/content/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/flashcards/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/flashcards/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/layout.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/layout'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/quiz-sets/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quiz-sets/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/quizzes/new/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/new/page'
      ),
    permission: 'update_user_groups',
    readsData: false,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/quizzes/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/resources/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/resources/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/[courseId]/modules/[moduleId]/youtube-links/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/youtube-links/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/courses/page.tsx',
    load: () =>
      import('@/app/[locale]/(dashboard)/[wsId]/education/courses/page'),
    permission: 'view_user_groups',
    readsData: true,
  },
  {
    name: 'education/library/flashcards/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/library/flashcards/page'
      ),
    permission: 'ai_lab',
    readsData: true,
  },
  {
    name: 'education/library/quiz-sets/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/library/quiz-sets/page'
      ),
    permission: 'ai_lab',
    readsData: true,
  },
  {
    name: 'education/library/quizzes/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/library/quizzes/page'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
  {
    name: 'education/quiz-sets/[setId]/layout.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/layout'
      ),
    permission: 'ai_lab',
    readsData: true,
  },
  {
    name: 'education/quiz-sets/[setId]/linked-modules/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/linked-modules/page'
      ),
    permission: 'ai_lab',
    readsData: true,
  },
  {
    name: 'education/quiz-sets/[setId]/page.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/education/quiz-sets/[setId]/page'
      ),
    permission: 'ai_lab',
    readsData: true,
  },
  {
    name: 'todo/page.tsx',
    load: () => import('@/app/[locale]/(dashboard)/[wsId]/todo/page'),
    permission: null,
    readsData: false,
  },
  {
    name: '(dashboard)/statistics/courses.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/statistics/courses'
      ),
    permission: 'view_user_groups',
    readsData: true,
  },
  {
    name: '(dashboard)/statistics/flashcards.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/statistics/flashcards'
      ),
    permission: 'ai_lab',
    readsData: true,
  },
  {
    name: '(dashboard)/statistics/quizzes.tsx',
    load: () =>
      import(
        '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/statistics/quizzes'
      ),
    permission: 'update_user_groups',
    readsData: true,
  },
] as const;

describe.each(boundaries)(
  '$name without a parent layout',
  ({ name, load, permission, readsData }) => {
    it('rejects a non-member before any workspace or content read', async () => {
      const { default: page } = await load();
      access.permissions.mockResolvedValue(null);
      await expect(page(props)).rejects.toThrow('NEXT_NOT_FOUND');
      expect(access.workspace).not.toHaveBeenCalled();
      expect(access.client).not.toHaveBeenCalled();
    });

    if (permission) {
      it('rejects a member missing the required permission before any read', async () => {
        const { default: page } = await load();
        access.withoutPermission.mockReturnValue(true);
        if (name.includes('/statistics/')) {
          await expect(page(props)).resolves.toBeNull();
        } else {
          await expect(page(props)).rejects.toThrow('NEXT_NOT_FOUND');
        }
        expect(access.withoutPermission).toHaveBeenCalledWith(permission);
        expect(access.workspace).not.toHaveBeenCalled();
        expect(access.contentRead).not.toHaveBeenCalled();
      });
    }

    it('rejects guests even when default permissions grant access', async () => {
      const { default: page } = await load();
      access.permissions.mockResolvedValue({
        wsId,
        membershipType: 'GUEST',
        withoutPermission: access.withoutPermission,
      });
      await expect(page(props)).rejects.toThrow('NEXT_NOT_FOUND');
      expect(access.workspace).not.toHaveBeenCalled();
      expect(access.educationFlag).not.toHaveBeenCalled();
      expect(access.client).not.toHaveBeenCalled();
    });

    it('rejects education-disabled workspaces before reading content', async () => {
      const { default: page } = await load();
      access.educationFlag.mockResolvedValue({
        data: { value: 'false' },
        error: null,
      });
      await expect(page(props)).rejects.toThrow('NEXT_NOT_FOUND');
      expect(access.workspace).not.toHaveBeenCalled();
      expect(access.educationFlag).toHaveBeenCalledOnce();
      expect(access.contentRead).not.toHaveBeenCalled();
    });

    it('fails closed on a flag lookup error before any protected read', async () => {
      const { default: page } = await load();
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        access.educationFlag.mockResolvedValue({
          data: { value: 'true' },
          error: new Error('sensitive flag diagnostic'),
        });
        await expect(page(props)).rejects.toThrow(
          'Failed to verify Teach education access'
        );
        expect(log.mock.calls).toEqual([
          ['Teach education flag lookup failed'],
        ]);
        expect(access.workspace).not.toHaveBeenCalled();
        expect(access.contentRead).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
      }
    });

    it('rejects claimed MEMBER permissions when the direct membership check fails', async () => {
      const { default: page } = await load();
      access.membership.mockResolvedValue({
        ok: false,
        error: 'membership_missing',
      });
      await expect(page(props)).rejects.toThrow('NEXT_NOT_FOUND');
      expect(access.educationFlag).not.toHaveBeenCalled();
      expect(access.workspace).not.toHaveBeenCalled();
      expect(access.contentRead).not.toHaveBeenCalled();
    });

    it('allows a member through to the protected read or page output', async () => {
      const { default: page } = await load();
      if (readsData) {
        await expect(page(props)).rejects.toThrow('PROTECTED_DATA_READ');
        expect(access.client).toHaveBeenCalled();
        expect(access.permissions.mock.invocationCallOrder[0]).toBeLessThan(
          access.client.mock.invocationCallOrder[0] ?? 0
        );
      } else {
        await expect(page(props)).resolves.toBeTruthy();
      }
      expect(access.permissions).toHaveBeenCalledWith('teach', wsId);
      if (permission)
        expect(access.withoutPermission).toHaveBeenCalledWith(permission);
    });
  }
);
