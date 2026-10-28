import { requireDevboxActor } from './authorization';

export function authorizeDevboxAgent(
  request: Request,
  options: { requireOnline?: boolean } = {}
) {
  return requireDevboxActor(request, { ...options, runner: true });
}
