/**
 * Learner progress recording stays off until the access review is in.
 * This is a code flag, not an environment setting, so production cannot
 * turn the routes on by configuration.
 */
export function learnerProgressRoutesEnabled() {
  return false;
}
