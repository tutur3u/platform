import type {
  adoptRetainedMailbox,
  inspectRetainedMailboxAdoption,
  RetainedMailboxReceipt,
} from '@tuturuuu/internal-api/infrastructure';
import { z } from 'zod';
import type { MigrationTuple } from './address-migration-session';

const Saved = z.strictObject({
  operationId: z.uuid(),
  phase: z.literal('unknown'),
  snapshot: z.string().regex(/^[a-f0-9]{64}$/),
});
export type AdoptionView =
  | { kind: 'idle' | 'busy' | 'unknown' | 'denied' | 'adopted' }
  | { kind: 'review'; receipt: RetainedMailboxReceipt };

export class RetainedMailboxAdoptionSession {
  private pending = false;
  private busy = false;
  private active = true;
  private generation = 0;
  private snapshot?: string;
  constructor(
    private readonly ports: {
      tuple: MigrationTuple;
      inspect: typeof inspectRetainedMailboxAdoption;
      adopt: typeof adoptRetainedMailbox;
      storage: Pick<Storage, 'getItem' | 'setItem'>;
      storageKey: string;
      assertActive(): void;
      changed(view: AdoptionView): void;
      adopted(): Promise<void>;
    }
  ) {}
  activate() {
    this.active = true;
  }
  retire() {
    this.active = false;
    this.generation++;
  }
  private assertActive(generation = this.generation) {
    if (!this.active || generation !== this.generation)
      throw new Error('Retired adoption');
    this.ports.assertActive();
  }
  private publish(view: AdoptionView) {
    this.assertActive();
    this.ports.changed(view);
  }
  private failure(generation: number) {
    if (!this.active || generation !== this.generation) return;
    try {
      this.publish({ kind: this.pending ? 'unknown' : 'denied' });
    } catch {
      // Revoked actors must not publish into the previous workspace lifetime.
    }
  }
  private exact(receipt: RetainedMailboxReceipt) {
    const t = this.ports.tuple;
    return (
      receipt.operationId === t.operationId &&
      receipt.userId === t.userId &&
      receipt.destinationAddress === t.destinationAddress &&
      receipt.expectedRevision === t.expectedRevision
    );
  }
  async inspect() {
    if (this.busy) return;
    this.assertActive();
    this.busy = true;
    const generation = this.generation;
    this.publish({ kind: 'busy' });
    try {
      const raw = this.ports.storage.getItem(this.ports.storageKey);
      if (raw) {
        const saved = Saved.parse(JSON.parse(raw));
        if (saved.operationId !== this.ports.tuple.operationId)
          throw new Error('Original operation changed');
        this.pending = true;
        this.snapshot = saved.snapshot;
      }
      const receipt = await this.ports.inspect(this.ports.tuple);
      this.assertActive(generation);
      if (
        !this.exact(receipt) ||
        (this.pending && receipt.snapshot !== this.snapshot)
      )
        throw new Error('Adoption receipt changed');
      if (receipt.status === 'adopted') {
        this.publish({ kind: 'adopted' });
        await this.ports.adopted();
      } else
        this.publish(
          this.pending ? { kind: 'unknown' } : { kind: 'review', receipt }
        );
    } catch {
      this.failure(generation);
    } finally {
      this.busy = false;
    }
  }
  async adopt(
    receipt: RetainedMailboxReceipt,
    confirmation: {
      userId: string;
      source: string;
      destination: string;
      ownershipConfirmed: boolean;
    }
  ) {
    const t = this.ports.tuple;
    if (
      this.busy ||
      this.pending ||
      receipt.status !== 'eligible' ||
      !this.exact(receipt) ||
      confirmation.userId !== t.userId ||
      confirmation.source !== t.sourceAddress ||
      confirmation.destination !== t.destinationAddress ||
      !confirmation.ownershipConfirmed
    )
      return;
    this.assertActive();
    this.busy = true;
    const generation = this.generation;
    this.publish({ kind: 'busy' });
    try {
      // Persist the original operation before dispatch; storage failure issues no write.
      this.ports.storage.setItem(
        this.ports.storageKey,
        JSON.stringify({
          operationId: t.operationId,
          phase: 'unknown',
          snapshot: receipt.snapshot,
        })
      );
      this.pending = true;
      this.snapshot = receipt.snapshot;
      this.assertActive(generation);
      await this.ports.adopt(t, {
        snapshot: receipt.snapshot,
        ownershipConfirmed: true,
      });
      this.assertActive(generation);
      // Always reconcile a committed receipt through a separate read transaction.
    } catch {
      this.failure(generation);
    } finally {
      this.busy = false;
    }
    if (this.active && generation === this.generation && this.pending)
      await this.inspect();
  }
}
