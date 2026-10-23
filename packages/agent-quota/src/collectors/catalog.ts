import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Provider } from '../types';

export interface CatalogInstance {
  instanceId: string;
  provider: Provider;
  label: string;
  models: string[];
  available: boolean;
}

export function parseCatalog(value: unknown): CatalogInstance[] {
  if (!value || typeof value !== 'object') return [];
  const envelope = value as Record<string, unknown>;
  const root = (envelope.structuredContent ?? value) as Record<string, unknown>;
  if (!Array.isArray(root.providers)) return [];
  return root.providers.flatMap((item: Record<string, unknown>) => {
    const provider =
      item.driverKind === 'claudeAgent' ? 'claude' : item.driverKind;
    if (
      provider !== 'codex' &&
      provider !== 'claude' &&
      provider !== 'antigravity'
    )
      return [];
    if (typeof item.providerInstanceId !== 'string') return [];
    return [
      {
        instanceId: item.providerInstanceId,
        provider,
        label:
          typeof item.displayName === 'string'
            ? item.displayName
            : item.providerInstanceId,
        models: Array.isArray(item.models)
          ? item.models.flatMap((model) =>
              typeof model?.id === 'string' ? [model.id] : []
            )
          : [],
        available: item.canRunChildTask === true,
      },
    ];
  });
}

export async function collectCatalog(): Promise<CatalogInstance[]> {
  const launcher = process.env.T3_ACP_MCP_NODE;
  if (!launcher) return [];
  try {
    const entry = process.env.T3_ACP_MCP_ENTRYPOINT;
    const { stdout } = await promisify(execFile)(
      launcher,
      [
        ...(entry ? [entry] : []),
        'acp-mcp-call',
        'orchestrator_capabilities',
        '{}',
      ],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        timeout: 5000,
        maxBuffer: 1_000_000,
      }
    );
    return parseCatalog(JSON.parse(stdout));
  } catch {
    return [];
  }
}
