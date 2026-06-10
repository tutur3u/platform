import type { Adapter, ChatConfig, StateAdapter } from 'chat';
import { Chat } from 'chat';
import {
  CHAT_SDK_PLATFORM_ADAPTERS,
  CHAT_SDK_STATE_ADAPTERS,
  type ChatSdkPlatformAdapterId,
  type ChatSdkStateAdapterId,
  getChatSdkPlatformAdapterDefinition,
  getChatSdkStateAdapterDefinition,
} from './adapters';

export type ChatSdkPlatformAdapterFactory = (config?: unknown) => Adapter;
export type ChatSdkStateAdapterFactory = (config?: unknown) => StateAdapter;
export type ChatSdkAdapterModule = Record<string, unknown>;
type ChatSdkPackageLoader = () => Promise<ChatSdkAdapterModule>;

export type ChatSdkPlatformAdapterInput =
  | Adapter
  | boolean
  | null
  | object
  | undefined;
export type ChatSdkPlatformAdapterConfigMap = Partial<
  Record<ChatSdkPlatformAdapterId, ChatSdkPlatformAdapterInput>
>;

export type ChatSdkStateAdapterInput =
  | StateAdapter
  | ChatSdkStateAdapterId
  | {
      config?: unknown;
      id: ChatSdkStateAdapterId;
    };

export interface CreateChatSdkRuntimeOptions
  extends Omit<ChatConfig, 'adapters' | 'state'> {
  adapters: ChatSdkPlatformAdapterConfigMap;
  state: ChatSdkStateAdapterInput;
}

const CHAT_SDK_PACKAGE_LOADERS: Record<string, ChatSdkPackageLoader> = {
  '@chat-adapter/state-ioredis': async () =>
    (await import('@chat-adapter/state-ioredis')) as ChatSdkAdapterModule,
  '@chat-adapter/state-memory': async () =>
    (await import('@chat-adapter/state-memory')) as ChatSdkAdapterModule,
  '@chat-adapter/state-pg': async () =>
    (await import('@chat-adapter/state-pg')) as ChatSdkAdapterModule,
  '@chat-adapter/state-redis': async () =>
    (await import('@chat-adapter/state-redis')) as ChatSdkAdapterModule,
  'chat-state-cloudflare-do': async () =>
    (await import('chat-state-cloudflare-do')) as ChatSdkAdapterModule,
  'chat-state-mysql': async () =>
    (await import('chat-state-mysql')) as ChatSdkAdapterModule,
};

async function loadChatSdkFactory(
  packageName: string,
  factoryExport: string
): Promise<(config?: unknown) => unknown> {
  let adapterModule: ChatSdkAdapterModule;

  try {
    adapterModule = CHAT_SDK_PACKAGE_LOADERS[packageName]
      ? await CHAT_SDK_PACKAGE_LOADERS[packageName]()
      : ((await import(packageName)) as ChatSdkAdapterModule);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Failed to load Chat SDK adapter package "${packageName}". ${message}`
    );
  }

  const factory = adapterModule[factoryExport];

  if (typeof factory !== 'function') {
    throw new Error(
      `Chat SDK adapter package "${packageName}" does not export "${factoryExport}".`
    );
  }

  return factory as (config?: unknown) => unknown;
}

function isAdapter(value: unknown): value is Adapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'handleWebhook' in value &&
    'name' in value
  );
}

function isStateAdapter(value: unknown): value is StateAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'get' in value &&
    'set' in value &&
    'delete' in value
  );
}

export async function loadChatSdkPlatformAdapterFactory(
  id: ChatSdkPlatformAdapterId
): Promise<ChatSdkPlatformAdapterFactory> {
  const definition = getChatSdkPlatformAdapterDefinition(id);
  const factory = await loadChatSdkFactory(
    definition.packageName,
    definition.factoryExport
  );

  return factory as ChatSdkPlatformAdapterFactory;
}

export async function loadChatSdkStateAdapterFactory(
  id: ChatSdkStateAdapterId
): Promise<ChatSdkStateAdapterFactory> {
  const definition = getChatSdkStateAdapterDefinition(id);
  const factory = await loadChatSdkFactory(
    definition.packageName,
    definition.factoryExport
  );

  return factory as ChatSdkStateAdapterFactory;
}

export async function createChatSdkPlatformAdapter(
  id: ChatSdkPlatformAdapterId,
  config?: unknown
): Promise<Adapter> {
  const factory = await loadChatSdkPlatformAdapterFactory(id);

  return factory(config);
}

export async function createChatSdkStateAdapter(
  id: ChatSdkStateAdapterId,
  config?: unknown
): Promise<StateAdapter> {
  const factory = await loadChatSdkStateAdapterFactory(id);

  return factory(config);
}

export async function createChatSdkAdapterMap(
  adapterConfigs: ChatSdkPlatformAdapterConfigMap
): Promise<Partial<Record<ChatSdkPlatformAdapterId, Adapter>>> {
  const entries = Object.entries(adapterConfigs) as [
    ChatSdkPlatformAdapterId,
    ChatSdkPlatformAdapterInput,
  ][];

  const adapters = await Promise.all(
    entries.flatMap(([id, input]) => {
      if (input === false || input === null || input === undefined) {
        return [];
      }

      return [
        Promise.resolve(
          isAdapter(input)
            ? input
            : createChatSdkPlatformAdapter(
                id,
                input === true ? undefined : input
              )
        ).then((adapter) => [id, adapter] as const),
      ];
    })
  );

  return Object.fromEntries(adapters) as Partial<
    Record<ChatSdkPlatformAdapterId, Adapter>
  >;
}

export async function resolveChatSdkStateAdapter(
  input: ChatSdkStateAdapterInput
): Promise<StateAdapter> {
  if (typeof input === 'string') {
    return createChatSdkStateAdapter(input);
  }

  if (isStateAdapter(input)) {
    return input;
  }

  return createChatSdkStateAdapter(input.id, input.config);
}

export async function createChatSdkRuntime({
  adapters,
  state,
  ...chatConfig
}: CreateChatSdkRuntimeOptions): Promise<Chat> {
  const [adapterMap, stateAdapter] = await Promise.all([
    createChatSdkAdapterMap(adapters),
    resolveChatSdkStateAdapter(state),
  ]);

  return new Chat({
    ...chatConfig,
    adapters: adapterMap,
    state: stateAdapter,
  });
}

export const chatSdkPlatformAdapterIds = CHAT_SDK_PLATFORM_ADAPTERS.map(
  (adapter) => adapter.id
);

export const chatSdkStateAdapterIds = CHAT_SDK_STATE_ADAPTERS.map(
  (adapter) => adapter.id
);
