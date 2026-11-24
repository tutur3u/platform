import type { CatalogFlag, FlagKind } from './lifecycle.mjs';
import type {
  RuntimeControllers,
  RuntimeDelegate,
  RuntimeRuleScope,
} from './runtime-definition.mjs';

/** One element of the `p_definitions` payload of feature_flag_sync_definitions. */
export interface RuntimeDefinitionRow {
  readonly key: string;
  readonly kind: FlagKind;
  readonly scopes: readonly RuntimeRuleScope[];
  readonly controllers: RuntimeControllers;
  readonly delegate: RuntimeDelegate | null;
}

/**
 * The runtime definitions of the deployed catalog, in the shape the rule store
 * validates and stores. Only `runtime` flags with a runtime block are listed.
 */
export function runtimeDefinitionRows(
  flags: readonly CatalogFlag[]
): RuntimeDefinitionRow[] {
  return flags.flatMap((flag) =>
    flag.family === 'runtime' && flag.runtime !== undefined
      ? [
          {
            key: flag.key,
            kind: flag.kind,
            scopes: flag.runtime.scopes,
            controllers: flag.runtime.controllers,
            delegate: flag.runtime.delegate ?? null,
          },
        ]
      : []
  );
}
