import noWallclockInTests from './rules/no-wallclock-in-tests.mjs';
import requireSuppressionReason from './rules/require-suppression-reason.mjs';
import noHardcodedAppOrigin from './rules/no-hardcoded-app-origin.mjs';

export default {
  meta: { name: 'tuturuuu' },
  rules: {
    'no-wallclock-in-tests': noWallclockInTests,
    'require-suppression-reason': requireSuppressionReason,
    'no-hardcoded-app-origin': noHardcodedAppOrigin,
  },
};
