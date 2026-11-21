import { z } from 'zod';
import {
  PEOPLE_KEY_PURPOSES,
  type PeopleKey,
  type PeopleKeyPurpose,
  unwrapWorkspaceKey,
} from './keys';
import type { PeopleRegistryContext } from './route';

const controlSchema = z.object({
  isOwner: z.boolean(),
  captureEnabled: z.boolean(),
  personalSessionsEnabled: z.boolean(),
  stopped: z.boolean(),
  generation: z.number(),
  keys: z.array(
    z.object({
      purpose: z.enum(PEOPLE_KEY_PURPOSES),
      version: z.number().int().positive(),
      wrappedKey: z.string(),
      current: z.boolean(),
    })
  ),
});

export type RegistryControl = Omit<z.infer<typeof controlSchema>, 'keys'>;

export type RegistryKeys = {
  all: PeopleKey[];
  current: (purpose: PeopleKeyPurpose) => PeopleKey;
};

// Loads the control row and unwraps its keys. Wrapped keys never leave the
// server; callers receive only the public control fields.
export async function loadControl(context: PeopleRegistryContext) {
  const result = await context.rpc('people_registry_get_control', {});
  if (!result.ok) return result;
  const parsed = controlSchema.safeParse(result.data);
  if (!parsed.success) throw new Error('Unexpected registry control shape');
  const { keys: wrapped, ...control } = parsed.data;
  const all = wrapped.map((key) => unwrapWorkspaceKey(context.wsId, key));
  const currentVersions = new Map(
    wrapped
      .filter((key) => key.current)
      .map((key) => [key.purpose, key.version])
  );
  const keys: RegistryKeys = {
    all,
    current: (purpose) => {
      const key = all.find(
        (k) =>
          k.purpose === purpose && k.version === currentVersions.get(purpose)
      );
      if (!key) throw new Error(`No current ${purpose} key`);
      return key;
    },
  };
  return { ok: true as const, control: control as RegistryControl, keys };
}
