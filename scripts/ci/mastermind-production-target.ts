// The Mastermind Worker's production target. Its own app and the shared
// fleet sync contract it validates against select the publisher.
export const mastermindProductionTarget = {
  app: 'mastermind',
  appPath: 'apps/mastermind',
  packageName: '@tuturuuu/mastermind',
  additionalPaths: ['apps/web/src/lib/mastermind/fleet/'],
  productionWorkflow: 'mastermind-cloudflare.yaml',
} as const;
