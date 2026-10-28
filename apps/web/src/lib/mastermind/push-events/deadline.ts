export const MASTERMIND_PUSH_FANOUT_BUDGET_MS = 60_000;

export class MastermindPushDeadlineExceeded extends Error {}

/** Race each boundary so a late operation cannot resume the fan-out. */
export function mastermindPushDeadline() {
  const expiresAt = Date.now() + MASTERMIND_PUSH_FANOUT_BUDGET_MS;
  const error = new MastermindPushDeadlineExceeded(
    'Mastermind push deadline exceeded'
  );
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(error);
    }, MASTERMIND_PUSH_FANOUT_BUDGET_MS);
  });
  function check() {
    if (expired || Date.now() >= expiresAt) throw error;
  }
  return {
    async run<T>(operation: () => PromiseLike<T>): Promise<T> {
      check();
      const value = await Promise.race([operation(), timeout]);
      check();
      return value;
    },
    cancel: () => clearTimeout(timer),
  };
}
