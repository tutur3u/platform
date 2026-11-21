const { sourceIdentityTests } = require('./native-source-identity-test-helper');

sourceIdentityTests({
  app: 'meet',
  workflowName: 'meet-cloudflare.yaml',
  jobName: 'validate',
  source: 'SOURCE_SHA',
  sourceExpression:
    "${{ github.event.pull_request.head.sha || (github.event_name == 'workflow_dispatch' && inputs.release && inputs.source_sha) || github.sha }}",
});
