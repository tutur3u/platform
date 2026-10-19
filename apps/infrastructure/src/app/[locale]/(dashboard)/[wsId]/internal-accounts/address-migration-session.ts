import { InternalApiError } from '@tuturuuu/internal-api/client';
import type {
  inspectInternalEmployeeAddressMigration,
  migrateInternalEmployeeAddress,
  prepareInternalEmployeeAddressMigration,
} from '@tuturuuu/internal-api/infrastructure';
import { z } from 'zod';

const Source = z.string().regex(/^[a-z0-9._+-]+@xwf\.tuturuuu\.com$/);
const Tuple = z
  .strictObject({
    operationId: z.uuid(),
    userId: z.uuid(),
    sourceAddress: Source,
    destinationAddress: z.string(),
    expectedRevision: z.literal(0),
  })
  .refine(
    (value) =>
      value.destinationAddress ===
      value.sourceAddress.replace('@xwf.tuturuuu.com', '@tuturuuu.com')
  );
const Receipt = z.strictObject({
  version: z.literal(2),
  tuple: Tuple,
  phase: z.enum([
    'unattempted',
    'inspect_unknown',
    'prepare_unknown',
    'prepared',
    'migration_dispatched',
  ]),
});
type Phase = z.infer<typeof Receipt>['phase'];
export type MigrationTuple = z.infer<typeof Tuple>;
type Inspection = Awaited<
  ReturnType<typeof inspectInternalEmployeeAddressMigration>
>;
type Ports = {
  inspect: typeof inspectInternalEmployeeAddressMigration;
  migrate: typeof migrateInternalEmployeeAddress;
  prepare: typeof prepareInternalEmployeeAddressMigration;
  assertActive(): void;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey: string;
  changed(view: MigrationView): void;
};
export type MigrationView =
  | { kind: 'editing' }
  | {
      kind: 'frozen' | 'prepared' | 'ready' | 'busy' | 'pending' | 'completed';
      tuple: MigrationTuple;
    }
  | { kind: 'denied'; tuple?: MigrationTuple };

export function validMigrationInput(
  userId: string,
  sourceAddress: string,
  operationId: string
) {
  return z
    .strictObject({
      userId: z.uuid(),
      sourceAddress: Source,
      operationId: z.union([z.literal(''), z.uuid()]),
    })
    .safeParse({ userId, sourceAddress, operationId }).success;
}

export function createMigrationTuple(
  userId: string,
  sourceAddress: string,
  operationId: string = crypto.randomUUID()
) {
  return Tuple.safeParse({
    operationId,
    userId,
    sourceAddress,
    destinationAddress: sourceAddress.replace(
      '@xwf.tuturuuu.com',
      '@tuturuuu.com'
    ),
    expectedRevision: 0,
  });
}

export class AddressMigrationSession {
  view: MigrationView = { kind: 'editing' };
  private active = true;
  private generation = 0;
  private busy = false;
  private blocked = false;
  private phase: Phase = 'unattempted';
  private tuple?: MigrationTuple;
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
  private save(phase: Phase) {
    this.ports.storage.setItem(
      this.ports.storageKey,
      JSON.stringify({
        version: 2,
        tuple: this.tuple,
        phase,
      })
    );
    this.phase = phase;
  }
  private freeze(tuple: MigrationTuple) {
    this.assertActive();
    if (this.blocked) return false;
    const parsed = Tuple.safeParse(tuple);
    if (!parsed.success) return false;
    if (this.tuple)
      return (
        parsed.data.operationId === this.tuple.operationId &&
        parsed.data.userId === this.tuple.userId &&
        parsed.data.sourceAddress === this.tuple.sourceAddress &&
        parsed.data.destinationAddress === this.tuple.destinationAddress &&
        parsed.data.expectedRevision === this.tuple.expectedRevision
      );
    this.tuple = parsed.data;
    try {
      this.save('unattempted');
    } catch {
      this.blocked = true;
      this.publish({ kind: 'denied', tuple });
      return false;
    }
    return true;
  }
  recover() {
    this.assertActive();
    if (this.busy) return;
    if (this.tuple || this.blocked) {
      this.recoveredView();
      return;
    }
    try {
      const raw = this.ports.storage.getItem(this.ports.storageKey);
      if (!raw) return;
      const value: unknown = JSON.parse(raw);
      const receipt = Receipt.safeParse(value);
      if (receipt.success) {
        this.tuple = receipt.data.tuple;
        this.phase = receipt.data.phase;
      } else {
        // Old bare tuples were written only at dispatch or observed pending.
        const legacy = Tuple.parse(value);
        this.tuple = legacy;
        this.phase = 'migration_dispatched';
      }
      this.recoveredView();
    } catch {
      this.blocked = true;
      this.publish({ kind: 'denied' });
    }
  }
  private recoveredView() {
    if (this.blocked) {
      this.publish({ kind: 'denied', tuple: this.tuple });
      return;
    }
    if (!this.tuple) return;
    const kind =
      this.phase === 'unattempted'
        ? 'frozen'
        : this.phase === 'prepared'
          ? 'prepared'
          : 'pending';
    this.publish({ kind, tuple: this.tuple });
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
      // Conservatively retain the dispatch fence even if storage fails.
      this.phase = 'migration_dispatched';
      this.save('migration_dispatched');
    }
    if (
      result.status === 'completed' &&
      result.operationId === tuple.operationId &&
      result.userId === tuple.userId &&
      result.email === tuple.destinationAddress
    ) {
      this.publish({ kind: 'completed', tuple });
    } else if (
      this.phase !== 'migration_dispatched' &&
      this.exactReady(result, tuple)
    ) {
      this.save(
        this.phase === 'prepare_unknown' || this.phase === 'prepared'
          ? 'prepared'
          : 'unattempted'
      );
      this.publish({ kind: 'ready', tuple });
    } else if (
      this.phase !== 'migration_dispatched' &&
      this.phase !== 'prepare_unknown' &&
      this.phase !== 'prepared' &&
      result.status === 'denied' &&
      (result.code === 'not_ready' || result.code === 'conflict')
    ) {
      this.save('unattempted');
      this.publish({ kind: 'denied', tuple });
    } else {
      this.publish({ kind: this.inspectOnly ? 'pending' : 'denied', tuple });
    }
  }
  private get inspectOnly() {
    return (
      this.phase === 'inspect_unknown' ||
      this.phase === 'prepare_unknown' ||
      this.phase === 'migration_dispatched'
    );
  }
  canPrepare() {
    return (
      !this.blocked &&
      !this.busy &&
      this.phase === 'unattempted' &&
      ['editing', 'frozen', 'denied'].includes(this.view.kind)
    );
  }
  private failure(tuple: MigrationTuple, generation: number) {
    if (this.active && generation === this.generation) {
      try {
        this.publish({ kind: this.inspectOnly ? 'pending' : 'denied', tuple });
      } catch {
        /* Retired actor. */
      }
    }
  }
  async inspect(tuple: MigrationTuple) {
    if (this.busy || !this.freeze(tuple)) return;
    const generation = this.generation;
    this.busy = true;
    this.publish({ kind: 'busy', tuple });
    try {
      if (this.phase === 'unattempted') this.save('inspect_unknown');
      let result: Inspection;
      try {
        result = await this.ports.inspect(tuple);
      } catch (error) {
        if (
          !(error instanceof InternalApiError) ||
          !(
            (error.status === 409 &&
              (error.code === 'not_ready' || error.code === 'conflict')) ||
            (error.status === 403 && error.code === 'forbidden') ||
            (error.status === 400 && error.code === 'invalid_input')
          )
        )
          throw error;
        const code = z
          .enum(['not_ready', 'conflict', 'forbidden', 'invalid_input'])
          .parse(error.code);
        result = { status: 'denied', code };
      }
      this.assertActive(generation);
      this.settle(result, tuple);
    } catch {
      this.failure(tuple, generation);
    } finally {
      this.busy = false;
    }
  }
  async prepare(
    tuple: MigrationTuple,
    target: string,
    source: string,
    destination: string
  ) {
    if (
      !this.canPrepare() ||
      target !== tuple.userId ||
      source !== tuple.sourceAddress ||
      destination !== tuple.destinationAddress ||
      !this.freeze(tuple)
    )
      return;
    const generation = this.generation;
    this.busy = true;
    this.publish({ kind: 'busy', tuple });
    try {
      this.save('prepare_unknown');
      const receipt = await this.ports.prepare(tuple);
      this.assertActive(generation);
      if (
        receipt.prepared !== true ||
        receipt.userId !== tuple.userId ||
        receipt.destinationAddress !== tuple.destinationAddress
      )
        throw new Error('Mismatched preparation');
      this.save('prepared');
      this.publish({ kind: 'prepared', tuple });
    } catch {
      this.failure(tuple, generation);
    } finally {
      this.busy = false;
    }
  }
  async migrate(sourceConfirmation: string, destinationConfirmation: string) {
    if (
      this.busy ||
      this.blocked ||
      this.inspectOnly ||
      this.view.kind !== 'ready'
    )
      return;
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
      const preflight = await this.ports.inspect(tuple);
      this.assertActive(generation);
      if (!this.exactReady(preflight, tuple)) {
        this.settle(preflight, tuple);
        return;
      }
      this.save('migration_dispatched');
      try {
        await this.ports.migrate(tuple);
      } catch {
        /* Unknown is inspect-only. */
      }
      this.assertActive(generation);
      const reconciliation = await this.ports.inspect(tuple);
      this.assertActive(generation);
      this.settle(reconciliation, tuple);
    } catch {
      this.failure(tuple, generation);
    } finally {
      this.busy = false;
    }
  }
}
