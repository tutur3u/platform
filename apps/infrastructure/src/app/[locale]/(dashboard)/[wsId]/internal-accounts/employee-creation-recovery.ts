import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  type EmployeeCreationObservation,
  getInternalEmployeeCreationOperation,
} from '@tuturuuu/internal-api/infrastructure';
import { z } from 'zod';

const ReferenceSchema = z
  .object({
    actorId: z.uuid(),
    workspaceId: z.uuid(),
    operationId: z.uuid(),
    email: z.email().endsWith('@tuturuuu.com'),
    displayName: z.string().trim().min(1).max(100),
    startedAt: z.number().int().nonnegative().nullable(),
    reads: z.number().int().min(0).max(6),
    state: z.enum(['pending', 'conflict', 'stopped']),
  })
  .strict();
export type CreationReference = z.infer<typeof ReferenceSchema>;
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class EmployeeCreationRecovery {
  private active = false;
  readonly key: string;
  reference: CreationReference | null = null;
  constructor(
    private readonly deps: {
      actorId: string;
      workspaceId: string;
      storage: StoragePort;
      assertActive(): void;
      now?: () => number;
      observe?: typeof getInternalEmployeeCreationOperation;
    }
  ) {
    this.key = `infra:employee-create:v1:${deps.actorId}:${deps.workspaceId}`;
  }
  activate() {
    this.active = true;
  }
  retire() {
    this.active = false;
  }
  assertActive() {
    if (!this.active) throw new Error('Creation context retired');
    this.deps.assertActive();
  }
  private now() {
    return (this.deps.now ?? Date.now)();
  }
  load() {
    this.assertActive();
    const raw = this.deps.storage.getItem(this.key);
    if (raw === null) return null;
    const value = ReferenceSchema.parse(JSON.parse(raw));
    if (
      value.actorId !== this.deps.actorId ||
      value.workspaceId !== this.deps.workspaceId
    )
      throw new Error('Creation scope mismatch');
    this.reference = value;
    return value;
  }
  private save(value: CreationReference) {
    this.assertActive();
    const parsed = ReferenceSchema.parse(value);
    const raw = JSON.stringify(parsed);
    try {
      this.deps.storage.setItem(this.key, raw);
      if (this.deps.storage.getItem(this.key) !== raw)
        throw new Error('Creation storage unavailable');
    } catch (error) {
      this.reference = { ...parsed, state: 'stopped' };
      throw error;
    }
    this.reference = parsed;
    return parsed;
  }
  prepare(input: { email: string; displayName: string }) {
    this.assertActive();
    if (this.load()) throw new Error('Unresolved original creation');
    return this.save({
      email: input.email,
      displayName: input.displayName,
      actorId: this.deps.actorId,
      workspaceId: this.deps.workspaceId,
      operationId: crypto.randomUUID(),
      startedAt: null,
      reads: 0,
      state: 'pending',
    });
  }
  stop(state: 'conflict' | 'stopped') {
    if (this.reference) this.save({ ...this.reference, state });
  }
  complete() {
    this.assertActive();
    this.deps.storage.removeItem(this.key);
    if (this.deps.storage.getItem(this.key) !== null)
      throw new Error('Creation storage unavailable');
    this.reference = null;
  }
  canRead() {
    const value = this.reference;
    return Boolean(
      this.active &&
        value &&
        value.state === 'pending' &&
        value.reads < 6 &&
        (value.startedAt === null ||
          (this.now() >= value.startedAt &&
            this.now() - value.startedAt < 30_000))
    );
  }
  async read(): Promise<EmployeeCreationObservation | null> {
    this.assertActive();
    if (!this.canRead() || !this.reference) return null;
    let value: CreationReference;
    try {
      value = this.save({
        ...this.reference,
        startedAt: this.reference.startedAt ?? this.now(),
        reads: this.reference.reads + 1,
      });
    } catch {
      return null;
    }
    try {
      const result = await (
        this.deps.observe ?? getInternalEmployeeCreationOperation
      )(value, { signal: AbortSignal.timeout(8000) });
      this.assertActive();
      if (result.status === 'created') {
        try {
          this.complete();
        } catch {
          /* Retain the confirmed outcome even if reference cleanup fails. */
        }
      } else if (result.status === 'conflict') this.stop('conflict');
      else if (result.status === 'stopped') this.stop('stopped');
      return result;
    } catch (error) {
      this.assertActive();
      if (
        error instanceof InternalApiError &&
        [400, 401, 403, 404].includes(error.status)
      ) {
        try {
          this.stop('stopped');
        } catch {
          /* Local state is already stopped on storage failure. */
        }
      }
      return null;
    }
  }
}
