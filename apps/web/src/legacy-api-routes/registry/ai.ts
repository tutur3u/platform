import type { LegacyApiRouteLoaderMap } from '../types';

export const aiRouteLoaders = {
  'ai/chat/delete-file/route.ts': () => import('../ai/chat/delete-file/route'),
  'ai/chat/file-urls/route.ts': () => import('../ai/chat/file-urls/route'),
  'ai/chat/google/new/route.ts': () => import('../ai/chat/google/new/route'),
  'ai/chat/google/route.ts': () => import('../ai/chat/google/route'),
  'ai/chat/google/summary/route.ts': () =>
    import('../ai/chat/google/summary/route'),
  'ai/chat/new/route.ts': () => import('../ai/chat/new/route'),
  'ai/chat/restore/route.ts': () => import('../ai/chat/restore/route'),
  'ai/chat/route.ts': () => import('../ai/chat/route'),
  'ai/chat/signed-read-url/route.ts': () =>
    import('../ai/chat/signed-read-url/route'),
  'ai/chat/summary/route.ts': () => import('../ai/chat/summary/route'),
  'ai/chat/upload-url/route.ts': () => import('../ai/chat/upload-url/route'),
  'ai/course/route.ts': () => import('../ai/course/route'),
  'ai/executions/route.ts': () => import('../ai/executions/route'),
  'ai/generate/route.ts': () => import('../ai/generate/route'),
  'ai/meetings/summary/route.ts': () => import('../ai/meetings/summary/route'),
  'ai/meetings/transcription/route.ts': () =>
    import('../ai/meetings/transcription/route'),
  'ai/objects/flashcards/route.ts': () =>
    import('../ai/objects/flashcards/route'),
  'ai/objects/quizzes/explanation/route.ts': () =>
    import('../ai/objects/quizzes/explanation/route'),
  'ai/objects/quizzes/route.ts': () => import('../ai/objects/quizzes/route'),
  'ai/objects/year-plan/route.ts': () =>
    import('../ai/objects/year-plan/route'),
  'ai/quiz/route.ts': () => import('../ai/quiz/route'),
  'ai/temp-auth/revoke/route.ts': () => import('../ai/temp-auth/revoke/route'),
  'ai/temp-auth/token/route.ts': () => import('../ai/temp-auth/token/route'),
  'ai/translate/route.ts': () => import('../ai/translate/route'),
} satisfies LegacyApiRouteLoaderMap;
