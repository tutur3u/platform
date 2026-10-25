import { createTuturuuuWebWorkspaceApiRewrites } from '@tuturuuu/utils/next-config';

export const financeCentralFirst = createTuturuuuWebWorkspaceApiRewrites(
  'https://tuturuuu.com'
).map(({ source }) => source);
