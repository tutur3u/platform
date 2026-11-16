import { CitationAiError } from './contracts';

/** A timed-out mutation is ambiguous; callers retain their operation fence. */
export async function boundedCitationOperation<T>(
  operation: PromiseLike<T>,
  milliseconds = 10000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new CitationAiError('AI_UNAVAILABLE', 503)),
          milliseconds
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
