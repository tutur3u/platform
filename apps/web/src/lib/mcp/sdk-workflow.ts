import type { McpConfig } from './contracts';
import { createHostedReadWorkflow } from './runtime';
import { createSdkTransport } from './sdk';

// Concrete official-SDK composition, deliberately no Next route or environment
// loader. Deployment still requires reviewed persistent/provider authority.
export function createSdkHostedReadWorkflow(
  config: McpConfig,
  dependencies: Omit<
    Parameters<typeof createHostedReadWorkflow>[1],
    'transport' | 'verify'
  >
) {
  return createHostedReadWorkflow(config, {
    ...dependencies,
    transport: createSdkTransport,
  });
}
