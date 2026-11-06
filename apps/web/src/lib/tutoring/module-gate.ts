import {
  isTutoringConfigEnabled,
  readTutoringModuleEnabled,
} from '@tuturuuu/education-core/todo/tutoring-module';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

/**
 * The rule is shared with the Teach/Learn to-do lists, which read the same
 * toggle; see `@tuturuuu/education-core/todo/tutoring-module`.
 */
export { isTutoringConfigEnabled };

/**
 * Server-side `ENABLE_TUTORING` gate. Fails closed: if the toggle or the
 * workspace cannot be read, the module is treated as off.
 */
export async function isTutoringEnabledForWorkspace(wsId: string) {
  return readTutoringModuleEnabled(
    await createAdminClient({ noCookie: true }),
    wsId
  );
}
