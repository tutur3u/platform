import {
  handleTasksRequest,
  type TasksExecutionContext,
  type TasksWorkerEnv,
} from '../src/runtime/worker-handler';

export default {
  fetch(request: Request, env: TasksWorkerEnv, ctx: TasksExecutionContext) {
    return handleTasksRequest(request, env, ctx);
  },
};
