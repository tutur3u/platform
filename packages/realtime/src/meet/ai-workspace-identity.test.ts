import { describe, expect, it } from 'vitest';
import {
  isMeetAiEnabledForWorkspace,
  isMeetAiHardDenied,
} from './ai-workspace-gate';

const protectedWs = '00000000-0000-4000-8000-0000000000ee';
const deniedWs = '00000000-0000-4000-8000-0000000000dd';
const allowedWs = '00000000-0000-4000-8000-0000000000aa';
const forms = (id: string) => [
  id.replaceAll('-', ''),
  `{${id}}`,
  id.toUpperCase(),
  ` ${id}`,
  `${id}\n`,
  `\t${id} `,
  `urn:uuid:${id}`,
  id.replaceAll('-', '').replace(/(.{4})(?=.)/g, '$1-'),
];
const env = {
  MEET_AI_PROTECTED_WORKSPACE_IDS: protectedWs,
  MEET_AI_DISABLED_WORKSPACE_IDS: deniedWs,
  MEET_AI_ENABLED_WORKSPACE_IDS: `${protectedWs},${deniedWs},${allowedWs}`,
};
describe('canonical database workspace identity', () => {
  for (const id of [protectedWs, deniedWs]) {
    it.each([id, ...forms(id)])(
      'denies protected or denylisted identity %j',
      (value) => {
        expect(isMeetAiEnabledForWorkspace(value, env)).toBe(false);
        expect(
          isMeetAiEnabledForWorkspace(value, {
            ...env,
            MEET_AI_ENABLED_WORKSPACE_IDS: undefined,
          })
        ).toBe(false);
      }
    );
  }
  it.each(forms(allowedWs))(
    'refuses noncanonical ids even when their canonical form is allowed: %j',
    (value) => {
      expect(isMeetAiEnabledForWorkspace(value, env)).toBe(false);
      // Parley uses this hard-deny path while bypassing only pilot lists.
      expect(isMeetAiHardDenied(value, env)).toBe(true);
    }
  );
  it('still allows a canonical unprotected workspace', () => {
    expect(isMeetAiEnabledForWorkspace(allowedWs, env)).toBe(true);
    expect(isMeetAiHardDenied(allowedWs, env)).toBe(false);
  });
});
