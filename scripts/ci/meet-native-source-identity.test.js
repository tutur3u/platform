const { sourceIdentityTests } = require('./native-source-identity-test-helper');

sourceIdentityTests({
  app: 'meet',
  workflowName: 'meet-cloudflare.yaml',
  jobName: 'validate',
  source: 'SOURCE_SHA',
});
