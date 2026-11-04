import {
  handleTasksRequest,
  type TasksExecutionContext,
  type TasksWorkerEnv,
} from '../src/runtime/worker-handler';
import { startupRefusal } from './startup';

export default {
  fetch(request: Request, env: TasksWorkerEnv, ctx: TasksExecutionContext) {
    const refused = startupRefusal(env);
    if (refused) return Promise.resolve(refused);
    return handleTasksRequest(request, env, ctx);
  },
};
