import { describe, expect, it } from 'vitest';
import {
  addStopReason,
  checkFences,
  clearStopReason,
  isAdmissionCurrent,
  OPEN_FENCE,
  parseTenantRouteStopReason,
  StopAuthorityError,
} from './stop-fence';

describe('stop fence ownership', () => {
  it('keeps the fence closed while another owner still holds a reason', () => {
    let state = addStopReason(OPEN_FENCE, 'operator', 'operator');
    state = addStopReason(state, 'tenant', 'tenant_manager');
    state = clearStopReason(state, 'tenant', 'tenant_manager');
    expect(state.reasons).toEqual(['operator']);
    expect(
      checkFences({
        globalStopped: false,
        globalGeneration: 0,
        tenant: state,
        channel: OPEN_FENCE,
      })
    ).toEqual({ open: false, layer: 'tenant' });
  });

  it('refuses a tenant manager lifting operator or billing stops', () => {
    const operator = addStopReason(OPEN_FENCE, 'operator', 'operator');
    expect(() =>
      clearStopReason(operator, 'operator', 'tenant_manager')
    ).toThrow(StopAuthorityError);
    const billing = addStopReason(OPEN_FENCE, 'billing', 'billing');
    expect(() => clearStopReason(billing, 'billing', 'tenant_manager')).toThrow(
      StopAuthorityError
    );
    expect(() => clearStopReason(billing, 'billing', 'operator')).toThrow(
      StopAuthorityError
    );
  });

  it('bumps the generation on every change and is idempotent otherwise', () => {
    const stopped = addStopReason(OPEN_FENCE, 'cap', 'system');
    expect(stopped.generation).toBe(1);
    expect(addStopReason(stopped, 'cap', 'system')).toBe(stopped);
    const resumed = clearStopReason(stopped, 'cap', 'system');
    expect(resumed.generation).toBe(2);
    expect(clearStopReason(resumed, 'cap', 'system')).toBe(resumed);
  });

  it('checks the global fence first', () => {
    expect(
      checkFences({
        globalStopped: true,
        globalGeneration: 1,
        tenant: OPEN_FENCE,
        channel: OPEN_FENCE,
      })
    ).toEqual({ open: false, layer: 'global' });
  });

  it('invalidates admitted work after a stop and resume', () => {
    const admitted = {
      globalGeneration: 0,
      tenantGeneration: 0,
      channelGeneration: 0,
    };
    const stopped = addStopReason(OPEN_FENCE, 'tenant', 'tenant_manager');
    const resumed = clearStopReason(stopped, 'tenant', 'tenant_manager');
    expect(
      isAdmissionCurrent(admitted, {
        globalStopped: false,
        globalGeneration: 0,
        tenant: resumed,
        channel: OPEN_FENCE,
      })
    ).toBe(false);
    expect(
      isAdmissionCurrent(admitted, {
        globalStopped: false,
        globalGeneration: 0,
        tenant: OPEN_FENCE,
        channel: OPEN_FENCE,
      })
    ).toBe(true);
  });

  it('invalidates admitted work after a global stop and resume', () => {
    const admitted = {
      globalGeneration: 4,
      tenantGeneration: 0,
      channelGeneration: 0,
    };
    expect(
      isAdmissionCurrent(admitted, {
        globalStopped: false,
        globalGeneration: 6,
        tenant: OPEN_FENCE,
        channel: OPEN_FENCE,
      })
    ).toBe(false);
  });

  it('lets only the system clear a cap stop', () => {
    const capped = addStopReason(OPEN_FENCE, 'cap', 'system');
    expect(() => clearStopReason(capped, 'cap', 'tenant_manager')).toThrow(
      StopAuthorityError
    );
  });

  it('keeps the tenant kill switch owned by the tenant', () => {
    const stopped = addStopReason(OPEN_FENCE, 'tenant', 'tenant_manager');
    expect(() => clearStopReason(stopped, 'tenant', 'operator')).toThrow(
      StopAuthorityError
    );
  });

  it('lets tenant routes set only the tenant reason', () => {
    expect(parseTenantRouteStopReason('tenant')).toBe('tenant');
    for (const reason of ['operator', 'billing', 'cap', undefined, 1]) {
      expect(() => parseTenantRouteStopReason(reason)).toThrow();
    }
  });
});
