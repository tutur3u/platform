import { InternalApiError } from '@tuturuuu/internal-api/client';
import {
  adjudicateEmployeeRejection,
  type EmployeeCreationObservation,
  type EmployeeRejectionRecoveryState,
  getInternalEmployeeCreationOperation,
  inspectEmployeeRejection,
} from '@tuturuuu/internal-api/infrastructure';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
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
    state: z.enum([
      'pending',
      'conflict',
      'stopped',
      'retry_ready',
      'adjudicating',
    ]),
    rejection: z
      .strictObject({
        targetUserId: z.uuid().optional(),
        originalLeaseId: z.uuid().optional(),
        originalAttemptEventId: z.uuid().optional(),
        eventId: z.uuid(),
        evidenceReferenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .nullable()
      .default(null),
  })
  .strict();
export type CreationReference = z.infer<typeof ReferenceSchema>;
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class EmployeeCreationRecovery {
  private active = false;
  private adjudicating = false;
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
      inspectRejection?: typeof inspectEmployeeRejection;
      adjudicateRejection?: typeof adjudicateEmployeeRejection;
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
    const existing = this.load();
    if (existing) {
      if (
        existing.state !== 'retry_ready' ||
        !existing.rejection ||
        existing.email !== input.email ||
        existing.displayName !== input.displayName
      )
        throw new Error('Unresolved original creation');
      return this.save({
        ...existing,
        state: 'pending',
        reads: 0,
        startedAt: null,
      });
    }
    return this.save({
      email: input.email,
      displayName: input.displayName,
      actorId: this.deps.actorId,
      workspaceId: this.deps.workspaceId,
      operationId: crypto.randomUUID(),
      startedAt: null,
      reads: 0,
      state: 'pending',
      rejection: null,
    });
  }
  private validateRejection(result: EmployeeRejectionRecoveryState) {
    this.assertActive();
    if (this.deps.workspaceId !== ROOT_WORKSPACE_ID)
      throw new Error('Recovery workspace denied');
    const value = this.reference;
    if (
      !value ||
      result.operationId !== value.operationId ||
      (result.status !== 'fenced' &&
        (result.actorUserId !== value.actorId ||
          result.email !== value.email ||
          result.displayName !== value.displayName))
    )
      throw new Error('Recovery scope mismatch');
    if (
      result.status !== 'fenced' &&
      value.rejection?.targetUserId &&
      (result.targetUserId !== value.rejection.targetUserId ||
        result.originalLeaseId !== value.rejection.originalLeaseId ||
        result.originalAttemptEventId !==
          value.rejection.originalAttemptEventId)
    )
      throw new Error('Recovery tuple mismatch');
    if (result.status === 'retry_ready') {
      if (
        !value.rejection ||
        result.eventId !== value.rejection.eventId ||
        result.evidenceReferenceSha256 !==
          value.rejection.evidenceReferenceSha256
      )
        throw new Error('Unrecognized adjudication');
      this.save({ ...value, state: 'retry_ready' });
    }
    return result;
  }
  async inspectRejection() {
    this.assertActive();
    if (this.deps.workspaceId !== ROOT_WORKSPACE_ID)
      throw new Error('Recovery workspace denied');
    if (!this.reference) throw new Error('Original creation required');
    return this.validateRejection(
      await (this.deps.inspectRejection ?? inspectEmployeeRejection)(
        this.reference.operationId
      )
    );
  }
  async adjudicateRejection(
    eligible: Extract<EmployeeRejectionRecoveryState, { status: 'eligible' }>,
    digest: string
  ) {
    this.assertActive();
    if (this.adjudicating) throw new Error('Adjudication in flight');
    this.adjudicating = true;
    try {
      this.validateRejection(eligible);
      const value = this.reference;
      if (!value) throw new Error('Original creation required');
      const parsedDigest = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(digest);
      if (
        value.rejection &&
        value.rejection.evidenceReferenceSha256 !== parsedDigest
      )
        throw new Error('Adjudication evidence mismatch');
      const fresh = await this.inspectRejection();
      if (fresh.status === 'retry_ready') return fresh;
      if (
        fresh.status !== 'eligible' ||
        fresh.targetUserId !== eligible.targetUserId ||
        fresh.originalLeaseId !== eligible.originalLeaseId ||
        fresh.originalAttemptEventId !== eligible.originalAttemptEventId ||
        fresh.expectedVersion !== eligible.expectedVersion
      )
        throw new Error('Fresh eligible recovery required');
      if (value.rejection && !value.rejection.targetUserId)
        throw new Error('Original adjudication tuple unavailable');
      const rejection = value.rejection ?? {
        targetUserId: fresh.targetUserId,
        originalLeaseId: fresh.originalLeaseId,
        originalAttemptEventId: fresh.originalAttemptEventId,
        eventId: crypto.randomUUID(),
        evidenceReferenceSha256: parsedDigest,
      };
      this.save({ ...value, state: 'adjudicating', rejection });
      // Persist the reference before dispatch. Any ambiguous response remains fenced.
      const result = await (
        this.deps.adjudicateRejection ?? adjudicateEmployeeRejection
      )({
        workspaceId: ROOT_WORKSPACE_ID,
        adjudication: {
          actorUserId: eligible.actorUserId,
          operationId: eligible.operationId,
          targetUserId: eligible.targetUserId,
          email: eligible.email,
          displayName: eligible.displayName,
          originalLeaseId: eligible.originalLeaseId,
          originalAttemptEventId: eligible.originalAttemptEventId,
          expectedVersion: 2,
          eventId: rejection.eventId,
          evidenceReferenceSha256: rejection.evidenceReferenceSha256,
          reason: 'administrator_adjudicated_terminal_auth_rejection',
          attestation: {
            kind: 'administrator-adjudication-v1',
            terminalAuthRejection: true,
            noRequestInFlight: true,
            absenceIsNotRejectionProof: true,
            acceptResponsibility: true,
          },
        },
      });
      return this.validateRejection(result);
    } finally {
      this.adjudicating = false;
    }
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
