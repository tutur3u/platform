export const CLIPBOARD_CLEAR_MS = 30_000;

interface ClipboardLike {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

type ClearOutcome = 'cleared' | 'changed' | 'unverifiable';

async function digest(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

let pending: ReturnType<typeof setTimeout> | undefined;

/**
 * Copies a secret and schedules a best-effort clear. The timer keeps only a
 * digest, never the plaintext, and clears only if the clipboard still holds the
 * copied value. Browser permissions, tab closure and clipboard history can
 * still defeat it, so the caller reports the outcome instead of promising it.
 */
export async function copyWithAutoClear(
  text: string,
  options: {
    clipboard?: ClipboardLike;
    delayMs?: number;
    onSettled?: (outcome: ClearOutcome) => void;
  } = {}
) {
  const clipboard = options.clipboard ?? navigator.clipboard;
  await clipboard.writeText(text);
  const expected = await digest(text);
  if (pending) clearTimeout(pending);
  pending = setTimeout(async () => {
    pending = undefined;
    try {
      const current = await clipboard.readText();
      if ((await digest(current)) !== expected)
        return options.onSettled?.('changed');
      await clipboard.writeText('');
      options.onSettled?.('cleared');
    } catch {
      options.onSettled?.('unverifiable');
    }
  }, options.delayMs ?? CLIPBOARD_CLEAR_MS);
}
