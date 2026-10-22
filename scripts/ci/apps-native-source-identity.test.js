const { sourceIdentityTests } = require('./native-source-identity-test-helper');

sourceIdentityTests({
  app: 'apps',
  workflowName: 'apps-cloudflare.yaml',
  jobName: 'validate',
  source: 'APPS_SOURCE_SHA',
});
