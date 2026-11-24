export type RuntimeRuleScope = 'platform' | 'workspace' | 'user';
export type RuntimeValueType = 'boolean';
export type PlatformController = 'platform-admin';
export type WorkspaceController = 'platform-admin' | 'workspace-admin';
export type UserController = 'platform-admin' | 'self';
export type RuntimeDelegate = 'workspace';

export interface RuntimeControllers {
  readonly platform: PlatformController;
  readonly workspace?: WorkspaceController;
  readonly user?: UserController;
}

export interface RuntimeDefinition {
  readonly type: RuntimeValueType;
  /** Rule scopes a stored rule may target; always includes `platform`. */
  readonly scopes: readonly RuntimeRuleScope[];
  readonly controllers: RuntimeControllers;
  /**
   * Legacy environment variable read only while no stored rule exists for the
   * flag. Null when the flag has no environment toggle.
   */
  readonly envFallback: string | null;
  /** Whether the evaluated boolean may be sent to a browser or app client. */
  readonly clientExposed: boolean;
  /**
   * `workspace` lets a workspace rule enable the flag on its own while the
   * platform rule is `on` or absent. Without it, a workspace rule only narrows
   * the platform decision. Requires the `workspace` scope.
   */
  readonly delegate?: RuntimeDelegate;
}

export declare const RUNTIME_RULE_SCOPES: readonly RuntimeRuleScope[];
export declare const RUNTIME_VALUE_TYPES: readonly RuntimeValueType[];
export declare const RUNTIME_DELEGATES: readonly RuntimeDelegate[];
export declare const RUNTIME_CONTROLLERS: Readonly<{
  platform: readonly PlatformController[];
  workspace: readonly WorkspaceController[];
  user: readonly UserController[];
}>;
export declare function validateRuntimeDefinition(runtime: unknown): string[];
