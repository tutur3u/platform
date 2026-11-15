import { createControlState, type ControlState } from './control-state';

/** One bounded read; uncertainty durably latches STOP until operator resume. */
export async function bootstrapControl(
  readV1: () => Promise<unknown>
): Promise<ControlState> {
  const state = createControlState(Date.now());
  state.stopped = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const source = await Promise.race([
      readV1(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('control read timeout')),
          1000
        );
      }),
    ]);
    if (
      source &&
      typeof source === 'object' &&
      'stopped' in source &&
      source.stopped === false &&
      'families' in source &&
      source.families &&
      typeof source.families === 'object' &&
      !Array.isArray(source.families) &&
      Object.values(source.families).every(
        (usage) => usage && usage.stopped === false
      )
    ) {
      state.stopped = false;
    }
  } catch {
    // Read failure is persisted as STOP, without retry or automatic resume.
  } finally {
    clearTimeout(timer);
  }
  return state;
}

/** Fixed public trace endpoint, fetched at most once per object instance. */
export async function controlColo(): Promise<string | null> {
  try {
    const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
      signal: AbortSignal.timeout(2000),
      redirect: 'manual',
    });
    if (!response.ok) return null;
    return /^colo=([A-Z]{3})$/m.exec(await response.text())?.[1] ?? null;
  } catch {
    return null;
  }
}
