import { describe, expect, it } from 'vitest';
import {
  getTemplateBackgroundPrefix,
  isWorkspaceTemplateBackgroundPath,
} from '../template-background-path';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_WS_ID = '00000000-0000-4000-8000-000000000002';

describe('isWorkspaceTemplateBackgroundPath', () => {
  it('accepts an object inside the workspace template-background folder', () => {
    expect(
      isWorkspaceTemplateBackgroundPath(
        `${getTemplateBackgroundPrefix(WS_ID)}cover.png`,
        WS_ID
      )
    ).toBe(true);
  });

  it.each([
    [`${OTHER_WS_ID}/template-backgrounds/cover.png`],
    [`${WS_ID}/finance/transactions/receipt.pdf`],
    [`${WS_ID}/template-backgrounds/`],
    [`${WS_ID}/template-backgrounds/../finance/receipt.pdf`],
    [`${WS_ID}/template-backgrounds/%2e%2e/finance/receipt.pdf`],
    [`${WS_ID}/template-backgrounds//cover.png`],
    [`/${WS_ID}/template-backgrounds/cover.png`],
    [''],
  ])('rejects %s', (path) => {
    expect(isWorkspaceTemplateBackgroundPath(path, WS_ID)).toBe(false);
  });

  it('rejects non-string paths and a missing workspace', () => {
    expect(isWorkspaceTemplateBackgroundPath(null, WS_ID)).toBe(false);
    expect(isWorkspaceTemplateBackgroundPath(42, WS_ID)).toBe(false);
    expect(
      isWorkspaceTemplateBackgroundPath(
        `${WS_ID}/template-backgrounds/cover.png`,
        null
      )
    ).toBe(false);
  });
});
