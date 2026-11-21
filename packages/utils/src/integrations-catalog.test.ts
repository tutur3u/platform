import { describe, expect, it } from 'vitest';
import {
  getVisibleIntegrationStatus,
  integrationsCatalog,
} from './integrations-catalog';

describe('integration status visibility', () => {
  it.each(integrationsCatalog)(
    'projects $id status for visitors and verified staff',
    (entry) => {
      expect(getVisibleIntegrationStatus(entry.status, false)).toBe(
        entry.status === 'early_access' ? 'coming_soon' : entry.status
      );
      expect(getVisibleIntegrationStatus(entry.status, true)).toBe(
        entry.status
      );
    }
  );
});
