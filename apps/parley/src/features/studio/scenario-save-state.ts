import type { ScenarioInput } from '@tuturuuu/meet-core/parley/contracts';

export type ScenarioSaveState = {
  status: 'idle' | 'saved' | 'invalid' | 'failed';
  errors: Partial<Record<keyof ScenarioInput, true>>;
};
