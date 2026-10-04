// Docker's PID cgroup counts runsc/Sentry/gofer host threads, not just guest
// tasks. Reserve a bounded runtime allowance and enforce the configured guest
// task ceiling independently inside gVisor through its OCI RLIMIT_NPROC.
const RUNTIME_HOST_TASK_ALLOWANCE = 128;
const MIN_GUEST_TASKS = 16;
const MAX_GUEST_TASKS = 256;

export function sandboxProcessBudget(guestTasks: number) {
  if (
    !Number.isInteger(guestTasks) ||
    guestTasks < MIN_GUEST_TASKS ||
    guestTasks > MAX_GUEST_TASKS
  )
    throw new Error('Invalid sandbox guest process limit');
  return {
    guestTasks,
    hostTasks: guestTasks + RUNTIME_HOST_TASK_ALLOWANCE,
  };
}

export function sandboxProcessArgs(guestTasks: number) {
  const budget = sandboxProcessBudget(guestTasks);
  return [
    `--pids-limit=${budget.hostTasks}`,
    `--ulimit=nproc=${budget.guestTasks}:${budget.guestTasks}`,
  ];
}
