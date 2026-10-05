import type { ProviderSeriesPlan, ProviderSeriesStep } from './plan';

export type ProviderSeriesCheckpoint = {
  step: number;
  kind?: 'create' | 'trim';
  result: { eventId: string; etag: string | null; deleted?: boolean };
};
export interface ProviderSeriesOperationStore {
  claim(): Promise<{
    plan: ProviderSeriesPlan;
    checkpoints: ProviderSeriesCheckpoint[];
    lease: string;
  }>;
  checkpoint(lease: string, value: ProviderSeriesCheckpoint): Promise<void>;
  finalize(lease: string): Promise<unknown>;
}
export interface ProviderSeriesWriter {
  assertAuthorized(): Promise<void>;
  apply(
    plan: ProviderSeriesPlan,
    step: ProviderSeriesStep,
    checkpoints: ProviderSeriesCheckpoint[]
  ): Promise<ProviderSeriesCheckpoint['result']>;
}

/** The store durably fences competing workers and retains completed provider
 * steps. Apply must be retry-safe if a response or its checkpoint is lost. */
export async function executeProviderSeriesOperation(
  store: ProviderSeriesOperationStore,
  provider: ProviderSeriesWriter
) {
  await provider.assertAuthorized();
  const operation = await store.claim();
  const { plan, lease } = operation;
  const checkpoints = [...operation.checkpoints];
  if (
    checkpoints.some((value, index) => value.step !== index) ||
    checkpoints.length > plan.steps.length
  ) {
    throw new Error('Invalid provider series checkpoint sequence');
  }
  if (
    plan.createBeforeTrim &&
    (plan.steps[0]?.kind !== 'create' ||
      plan.steps[1]?.kind !== 'trim' ||
      checkpoints.some((value) => value.kind !== plan.steps[value.step]?.kind))
  )
    throw new Error('Invalid create-before-trim checkpoint roles');
  for (let index = checkpoints.length; index < plan.steps.length; index++) {
    await provider.assertAuthorized();
    const result = await provider.apply(plan, plan.steps[index]!, checkpoints);
    const checkpoint: ProviderSeriesCheckpoint = {
      step: index,
      result,
      ...(plan.createBeforeTrim
        ? { kind: plan.steps[index]!.kind as 'create' | 'trim' }
        : {}),
    };
    await store.checkpoint(lease, checkpoint);
    checkpoints.push(checkpoint);
  }
  await provider.assertAuthorized();
  return store.finalize(lease);
}
