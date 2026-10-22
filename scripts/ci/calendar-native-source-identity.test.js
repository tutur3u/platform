const { sourceIdentityTests } = require('./native-source-identity-test-helper');

sourceIdentityTests({
  app: 'calendar',
  workflowName: 'mail-calendar-tasks-builds.yaml',
  jobName: 'calendar-native',
  source: 'SOURCE_SHA',
});
