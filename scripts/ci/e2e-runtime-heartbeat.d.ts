export const HEARTBEAT_INTERVAL_MS: number;
export function startRuntimeHeartbeat(
  role: 'worker' | 'runner',
  env?: NodeJS.ProcessEnv
): () => void;
export function withRuntimeHeartbeat<T>(
  role: 'worker' | 'runner',
  action: () => Promise<T>,
  env?: NodeJS.ProcessEnv
): Promise<T>;
