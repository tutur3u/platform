import { z } from 'zod';
import { InternalApiError } from '../client';
import {
  getInternalEmployeeManagement,
  type InternalEmployeeManagement,
  reconcileInternalEmployee,
} from './employee-management';
import { restoreInternalEmployee } from './employee-restoration';

const revision = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
const operation = z.object({
  operationId: z.uuid(),
  revision,
  phase: z.enum(['reserved', 'attempted', 'unknown', 'completed']),
});
const nextAction = z.enum([
  'none',
  'restore',
  'inspect',
  'creation_reconciliation_required',
  'adoption_required',
  'manual_review',
]);
const observation = z
  .object({
    id: z.uuid(),
    email: z.string().nullable(),
    registryState: z.enum(['absent', 'pending', 'provisioned', 'active']),
    managedName: z.string().nullable(),
    managementRoleLabel: z.string().nullable(),
    revision,
    mailboxReady: z.boolean(),
    readinessCode: z.enum([
      'ready',
      'not_managed',
      'creation_pending',
      'tuple_conflict',
      'mailbox_unavailable',
    ]),
    reservation: z.enum(['none', 'exact_intent', 'conflicting_tuple']),
    managed: z.boolean(),
    operation: operation.nullable(),
    recovery: z
      .object({ email: z.string().nullable(), verified: z.boolean() })
      .nullable(),
    providerState: z.enum([
      'confirmed_active',
      'confirmed_banned',
      'unconfirmed',
      'missing',
      'unknown',
    ]),
  })
  .extend({ revision: revision.nullable() });
const detailSchema = observation.extend({
  providerReadAt: z.iso.datetime({ offset: true }),
  nextAction,
});
const replySchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('restored'),
    account: z.object({
      id: z.uuid(),
      email: z.string(),
      displayName: z.string(),
    }),
    operationId: z.uuid(),
    revision,
  }),
  z.object({
    status: z.literal('pending'),
    code: z.enum([
      'employee_restore_outcome_unknown',
      'employee_restore_confirmation_pending',
    ]),
    operationId: z.uuid(),
    nextAction: z.literal('inspect'),
    message: z.string(),
  }),
  z.object({ status: z.literal('observed'), observation, nextAction }),
]);

type Retained = {
  confirmationEmail: string;
  expectedRevision: number;
  operationId?: string;
};
export type EmployeeRestorationView = {
  detail: InternalEmployeeManagement | null;
  outcome:
    | 'idle'
    | 'pending'
    | 'restored'
    | 'unavailable'
    | 'denied'
    | 'conflict';
  busy: boolean;
  retained: Retained | null;
  restoreAttempted: boolean;
};

type Transport = {
  inspect: typeof getInternalEmployeeManagement;
  restore: typeof restoreInternalEmployee;
  reconcile: typeof reconcileInternalEmployee;
};

/** One actor/workspace/target lifetime. Only explicit actions call transports. */
export class EmployeeRestorationConsumer {
  view: EmployeeRestorationView = {
    detail: null,
    outcome: 'idle',
    busy: false,
    retained: null,
    restoreAttempted: false,
  };
  constructor(
    private readonly input: {
      targetId: string;
      email: string;
      assertActive: () => void;
      transport?: Transport;
    }
  ) {}
  private revisionConflict = false;
  private get transport(): Transport {
    return (
      this.input.transport ?? {
        inspect: getInternalEmployeeManagement,
        restore: restoreInternalEmployee,
        reconcile: reconcileInternalEmployee,
      }
    );
  }
  private assertActive() {
    this.input.assertActive();
  }
  private async read() {
    this.assertActive();
    this.view = {
      ...this.view,
      detail: null,
      outcome: this.view.outcome === 'restored' ? 'pending' : this.view.outcome,
    };
    const raw = await this.transport.inspect(this.input.targetId);
    this.assertActive();
    const detail = detailSchema.parse(raw);
    if (detail.id !== this.input.targetId || detail.email !== this.input.email)
      throw new Error('Inspection tuple changed');
    const retained = this.view.retained;
    if (retained && detail.operation && !this.revisionConflict) {
      if (
        detail.operation.revision !== retained.expectedRevision ||
        (retained.operationId &&
          detail.operation.operationId !== retained.operationId)
      )
        throw new Error('Operation tuple changed');
      this.view = {
        ...this.view,
        retained: { ...retained, operationId: detail.operation.operationId },
      };
    }
    this.view = { ...this.view, detail };
    if (
      retained &&
      !this.revisionConflict &&
      detail.operation?.phase === 'completed' &&
      detail.revision === retained.expectedRevision + 1 &&
      detail.providerState === 'confirmed_active' &&
      detail.managed &&
      detail.registryState === 'active' &&
      detail.mailboxReady &&
      detail.readinessCode === 'ready' &&
      detail.nextAction === 'none'
    ) {
      this.view = { ...this.view, outcome: 'restored' };
    }
    return detail;
  }
  private failure(error: unknown) {
    this.assertActive();
    const denied =
      error instanceof InternalApiError && [401, 403].includes(error.status);
    const unavailable =
      error instanceof InternalApiError &&
      error.status === 503 &&
      error.code === 'employee_management_unavailable';
    const revisionConflict =
      error instanceof InternalApiError &&
      error.status === 409 &&
      error.code === 'employee_revision_or_operation_conflict';
    this.revisionConflict ||= revisionConflict;
    this.view = {
      ...this.view,
      detail: null,
      outcome: denied
        ? 'denied'
        : this.revisionConflict
          ? 'conflict'
          : unavailable
            ? 'unavailable'
            : this.view.restoreAttempted || this.view.retained
              ? 'pending'
              : 'conflict',
    };
  }
  async inspect() {
    if (this.view.busy || this.view.outcome === 'denied') return;
    this.assertActive();
    this.view = { ...this.view, busy: true, detail: null };
    try {
      await this.read();
    } catch (error) {
      this.failure(error);
    } finally {
      this.view = { ...this.view, busy: false };
    }
  }
  get action(): 'restore' | 'reconcile' | null {
    const { detail, busy, outcome, retained, restoreAttempted } = this.view;
    if (
      !detail ||
      busy ||
      this.revisionConflict ||
      ['denied', 'unavailable', 'restored'].includes(outcome)
    )
      return null;
    if (
      detail.nextAction === 'inspect' &&
      detail.operation &&
      detail.operation.phase !== 'completed' &&
      (!retained ||
        (detail.operation.revision === retained.expectedRevision &&
          (!retained.operationId ||
            detail.operation.operationId === retained.operationId)))
    )
      return 'reconcile';
    if (
      !restoreAttempted &&
      !retained &&
      detail.nextAction === 'restore' &&
      detail.managed &&
      detail.registryState === 'active' &&
      detail.mailboxReady &&
      detail.readinessCode === 'ready' &&
      detail.reservation !== 'conflicting_tuple' &&
      detail.providerState === 'confirmed_banned' &&
      detail.revision !== null &&
      (!detail.operation || detail.operation.phase === 'completed')
    )
      return 'restore';
    return null;
  }
  async submit(confirmationEmail: string) {
    const action = this.action;
    if (!action || confirmationEmail !== this.input.email) return;
    this.assertActive();
    const before = this.view.detail;
    if (!before) return;
    this.view = { ...this.view, busy: true };
    try {
      const current = await this.read();
      if (
        current.revision !== before.revision ||
        current.nextAction !== before.nextAction ||
        current.operation?.operationId !== before.operation?.operationId ||
        current.operation?.phase !== before.operation?.phase
      )
        throw new Error('Inspection changed; inspect again');
      this.view = { ...this.view, busy: false };
      if (this.action !== action) return;
      const retained =
        this.view.retained ??
        (action === 'reconcile' && current.operation
          ? {
              confirmationEmail,
              expectedRevision: current.operation.revision,
              operationId: current.operation.operationId,
            }
          : current.revision !== null
            ? { confirmationEmail, expectedRevision: current.revision }
            : null);
      if (!retained) return;
      this.assertActive();
      this.view = {
        ...this.view,
        busy: true,
        retained,
        restoreAttempted: this.view.restoreAttempted || action === 'restore',
        outcome: 'pending',
      };
      const raw = await (action === 'restore'
        ? this.transport.restore(this.input.targetId, retained)
        : this.transport.reconcile(this.input.targetId, retained));
      this.assertActive();
      const result = replySchema.parse(raw);
      if (result.status === 'observed') {
        if (
          result.observation.id !== this.input.targetId ||
          result.observation.email !== confirmationEmail
        )
          throw new Error('Observation tuple changed');
      } else {
        if (retained.operationId && result.operationId !== retained.operationId)
          throw new Error('Operation changed');
        if (
          result.status === 'restored' &&
          (result.account.id !== this.input.targetId ||
            result.account.email !== confirmationEmail ||
            result.revision !== retained.expectedRevision + 1)
        )
          throw new Error('Receipt tuple changed');
        this.view = {
          ...this.view,
          retained: { ...retained, operationId: result.operationId },
        };
      }
      await this.read();
    } catch (error) {
      this.failure(error);
    } finally {
      this.view = { ...this.view, busy: false };
    }
  }
}
