import { openMemoryDatabase, runMemoryCommand } from './database';
import { type CallerSecrets, handleMemoryRequest } from './handler';

type Env = CallerSecrets & {
  MEMORY_WORKER_ENABLED?: string;
  MEMORY_DB?: { connectionString: string };
};

export default {
  fetch(request: Request, env: Env) {
    if (env.MEMORY_WORKER_ENABLED !== 'true' || !env.MEMORY_DB) {
      return Response.json(
        { error: 'memory_stopped' },
        {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }
    const { connectionString } = env.MEMORY_DB;
    return handleMemoryRequest(request, env, (caller, command) =>
      runMemoryCommand(openMemoryDatabase(connectionString), caller, command)
    );
  },
};
