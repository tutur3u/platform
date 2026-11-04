import {
  handleTasksRequest,
  type TasksExecutionContext,
  type TasksWorkerEnv,
} from '../src/runtime/worker-handler';
import { misconfiguredResponse, missingRequiredEnv } from './required-env';

export default {
  fetch(request: Request, env: TasksWorkerEnv, ctx: TasksExecutionContext) {
    const refused = misconfiguredResponse(missingRequiredEnv(env));
    if (refused) return Promise.resolve(refused);
    return handleTasksRequest(request, env, ctx);
  },
};
