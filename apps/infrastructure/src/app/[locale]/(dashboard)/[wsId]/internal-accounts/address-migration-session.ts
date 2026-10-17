import type {
  inspectInternalEmployeeAddressMigration,
  migrateInternalEmployeeAddress,
} from '@tuturuuu/internal-api/infrastructure';
import { z } from 'zod';

const Tuple = z
  .strictObject({
    operationId: z.uuid(),
    userId: z.uuid(),
    sourceAddress: z.string().regex(/^[a-z0-9._+-]+@xwf\.tuturuuu\.com$/),
    destinationAddress: z.string(),
    expectedRevision: z.literal(0),
  })
  .refine(
    (value) =>
      value.destinationAddress ===
      value.sourceAddress.replace('@xwf.tuturuuu.com', '@tuturuuu.com')
  );
export type MigrationTuple = z.infer<typeof Tuple>;
type Inspection = Awaited<
  ReturnType<typeof inspectInternalEmployeeAddressMigration>
>;
type Ports = {
  inspect: typeof inspectInternalEmployeeAddressMigration;
  migrate: typeof migrateInternalEmployeeAddress;
  assertActive(): void;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey: string;
  changed(view: MigrationView): void;
};
export type MigrationView =
  | { kind: 'editing' }
  | { kind: 'ready'; tuple: MigrationTuple }
  | { kind: 'busy'; tuple: MigrationTuple }
  | { kind: 'denied'; tuple?: MigrationTuple }
  | { kind: 'pending'; tuple: MigrationTuple }
  | { kind: 'completed'; tuple: MigrationTuple };

export function createMigrationTuple(userId: string, sourceAddress: string) {
  return Tuple.safeParse({
    operationId: crypto.randomUUID(),
    userId,
    sourceAddress,
    destinationAddress: sourceAddress.replace(
      '@xwf.tuturuuu.com',
      '@tuturuuu.com'
    ),
    expectedRevision: 0,
  });
}

/** A dispatched operation can only be inspected, including after a remount. */
export class AddressMigrationSession {
  view: MigrationView = { kind: 'editing' };
  private active = true;
  private generation = 0;
  private busy = false;
  private dispatched = false;
  constructor(private readonly ports: Ports) {}
  activate() {
    this.active = true;
  }
  retire() {
    this.active = false;
    this.generation++;
  }
  private assertActive(generation = this.generation) {
    if (!this.active || generation !== this.generation)
      throw new Error('Retired migration view');
    this.ports.assertActive();
  }
  private publish(view: MigrationView) {
    this.assertActive();
    this.view = view;
    this.ports.changed(view);
  }
  recover() {
    this.assertActive();
    try {
      const raw = this.ports.storage.getItem(this.ports.storageKey);
      if (!raw) return;
      this.dispatched = true;
      const parsed = Tuple.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.publish({ kind: 'denied' });
        return;
      }
      this.publish({ kind: 'pending', tuple: parsed.data });
    } catch {
      this.dispatched = true;
      this.publish({ kind: 'denied' });
    }
  }
  private exactReady(result: Inspection, tuple: MigrationTuple) {
    return (
      result.status === 'ready' &&
      result.operationId === tuple.operationId &&
      result.userId === tuple.userId &&
      result.sourceAddress === tuple.sourceAddress &&
      result.destinationAddress === tuple.destinationAddress &&
      result.expectedRevision === tuple.expectedRevision
    );
  }
  private settle(result: Inspection, tuple: MigrationTuple) {
    if (
      (result.status === 'pending' || result.status === 'completed') &&
      result.operationId === tuple.operationId
    ) {
      this.dispatched = true;
      try {
        this.ports.storage.setItem(
          this.ports.storageKey,
          JSON.stringify(tuple)
        );
      } catch {
        this.publish({ kind: 'pending', tuple });
        return;
      }
    }
    if (
      result.status === 'completed' &&
      result.operationId === tuple.operationId &&
      result.userId === tuple.userId &&
      result.email === tuple.destinationAddress
    ) {
      this.publish({ kind: 'completed', tuple });
    } else if (!this.dispatched && this.exactReady(result, tuple)) {
      this.publish({ kind: 'ready', tuple });
    } else {
      this.publish(
        this.dispatched ? { kind: 'pending', tuple } : { kind: 'denied' }
      );
    }
  }
  async inspect(tuple: MigrationTuple) {
    if (this.busy) return;
    this.assertActive();
    const generation = this.generation;
    this.busy = true;
    this.publish({ kind: 'busy', tuple });
    try {
      const result = await this.ports.inspect(tuple);
      this.assertActive(generation);
      this.settle(result, tuple);
    } catch {
      if (this.active && generation === this.generation) {
        try {
          this.publish(
            this.dispatched ? { kind: 'pending', tuple } : { kind: 'denied' }
          );
        } catch {
          /* Retired actor. */
        }
      }
    } finally {
      this.busy = false;
    }
  }
  async migrate(sourceConfirmation: string, destinationConfirmation: string) {
    if (this.busy || this.dispatched || this.view.kind !== 'ready') return;
    const { tuple } = this.view;
    if (
      sourceConfirmation !== tuple.sourceAddress ||
      destinationConfirmation !== tuple.destinationAddress
    )
      return;
    this.assertActive();
    const generation = this.generation;
    this.busy = true;
    this.publish({ kind: 'busy', tuple });
    try {
      // Fresh authorization and readiness precede the sole migration request.
      const preflight = await this.ports.inspect(tuple);
      this.assertActive(generation);
      if (!this.exactReady(preflight, tuple)) {
        this.settle(preflight, tuple);
        return;
      }
      // Failure to retain recovery evidence prevents dispatch.
      this.ports.storage.setItem(this.ports.storageKey, JSON.stringify(tuple));
      this.dispatched = true;
      try {
        await this.ports.migrate(tuple);
      } catch {
        /* Unknown is inspect-only. */
      }
      this.assertActive(generation);
      // A write reply alone never establishes completion.
      const reconciliation = await this.ports.inspect(tuple);
      this.assertActive(generation);
      this.settle(reconciliation, tuple);
    } catch {
      if (this.active && generation === this.generation) {
        try {
          this.publish(
            this.dispatched ? { kind: 'pending', tuple } : { kind: 'denied' }
          );
        } catch {
          /* Retired actor. */
        }
      }
    } finally {
      this.busy = false;
    }
  }
}
