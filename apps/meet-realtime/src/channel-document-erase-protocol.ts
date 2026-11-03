import { Y } from '@tuturuuu/realtime/collaboration/server';
import { z } from 'zod';
import { serviceRequestHeaders } from '../../../packages/realtime/src/core/service-request';
import { signRealtimePayload } from '../../../packages/realtime/src/core/token';
import {
  documentBlocked,
  documentEraseStateSchema,
  type EraseCommand,
  sha256,
  verifyEraseCommand,
} from '../../../packages/realtime/src/documents/erase';
import { applyDocumentErase, documentHashes } from './channel-document-erase';
import type { ChannelRoomDurableObject } from './channel-room-do';
export class ChannelDocumentErase {
  private checkedAt = 0;
  private refusals = 0;
  constructor(private room: ChannelRoomDurableObject) {}
  invalidateGate() {
    this.checkedAt = 0;
    this.room.documentAllowed = false;
  }
  private refuse(code: string) {
    console.warn('Meeting document gate refused', {
      code,
      count: ++this.refusals,
    });
    return false;
  }
  async platformEraseCall(
    action: 'generation' | 'status' | 'admit',
    body: Record<string, unknown> = {}
  ) {
    if (
      !this.room.metadata ||
      !this.room.env.MEET_ERASE_CALLBACK_KEY_V1 ||
      this.room.env.MEET_ERASE_CALLBACK_KEY_V1 ===
        this.room.env.MEET_REALTIME_TOKEN_SECRET ||
      !Number.isSafeInteger(
        Number(this.room.env.MEET_ERASE_CALLBACK_KEY_VERSION ?? '1')
      ) ||
      Number(this.room.env.MEET_ERASE_CALLBACK_KEY_VERSION ?? '1') < 1
    )
      throw new Error('Erase service unavailable');
    const base = new URL(
      this.room.env.PLATFORM_API_BASE_URL ?? 'https://tuturuuu.com'
    );
    if (base.protocol !== 'https:') throw new Error('Invalid endpoint');
    const claims = {
      ...body,
      aud: 'tuturuuu.document-erase-callback',
      kind: action,
      namespace: 'CHANNEL_ROOM',
      topic: this.room.metadata.topic,
      meeting_id: this.room.metadata.topic.slice('meeting-document-'.length),
      document_id: this.room.metadata.documentId,
      nonce: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 30,
      key_version: Number(this.room.env.MEET_ERASE_CALLBACK_KEY_VERSION ?? '1'),
    };
    const token = signRealtimePayload(
      claims,
      this.room.env.MEET_ERASE_CALLBACK_KEY_V1
    );
    const response = await fetch(
      new URL('/api/v1/realtime/documents/erase-state', base),
      {
        method: 'POST',
        headers: serviceRequestHeaders(token),
        body: JSON.stringify(claims),
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      }
    );
    if (!response.ok) throw new Error('Erase service unavailable');
    return (await response.json()) as Record<string, unknown>;
  }
  async checkDocumentGate() {
    if (this.room.env.MEET_ERASE_DO_PROTOCOL !== 'true') {
      this.room.documentAllowed =
        !this.room.erase.freeze && this.room.erase.installedGeneration === 0;
      return this.room.documentAllowed;
    }
    if (this.checkedAt && Date.now() - this.checkedAt < 30000)
      return this.room.documentAllowed;
    this.checkedAt = Date.now();
    this.room.documentAllowed = false;
    try {
      const state = documentEraseStateSchema.parse(
        await this.platformEraseCall('generation')
      );
      if (this.room.erase.freeze || documentBlocked(state))
        return this.refuse('hold');
      if (this.room.erase.installedGeneration < state.doc_generation) {
        const receipt = state.last_receipt;
        if (
          state.pg_installed_generation !== state.doc_generation ||
          !state.pg_state ||
          !receipt
        )
          return this.refuse('missing_copy');
        const candidate = new Y.Doc();
        try {
          Y.applyUpdate(candidate, Uint8Array.from(state.pg_state));
          const hashes = await documentHashes(candidate);
          if (
            hashes.post_state_hash !== receipt.post_state_hash ||
            hashes.post_pm_hash !== receipt.post_pm_hash ||
            state.pg_post_state_hash !== hashes.post_state_hash ||
            state.pg_post_pm_hash !== hashes.post_pm_hash
          ) {
            candidate.destroy();
            return this.refuse('copy_mismatch');
          }
          const erase = {
            ...this.room.erase,
            installedGeneration: state.doc_generation,
          };
          await this.room.state.storage.put({
            document: Y.encodeStateAsUpdate(candidate),
            erase,
          });
          this.room.doc.destroy();
          this.room.doc = candidate;
          this.room.erase = erase;
        } catch {
          candidate.destroy();
          return this.refuse('invalid_copy');
        }
      }
      this.room.documentAllowed =
        this.room.erase.installedGeneration === state.doc_generation;
    } catch {
      return this.refuse('callback_unavailable');
    }
    if (!this.room.documentAllowed) this.refuse('generation_mismatch');
    return this.room.documentAllowed;
  }
  async eraseCommand(request: Request) {
    if (this.room.env.MEET_ERASE_DO_PROTOCOL !== 'true')
      return new Response(null, { status: 404 });
    const raw =
      request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? '';
    const command = await verifyEraseCommand(
      raw,
      this.room.env.MEET_ERASE_DO_PUBLIC_KEYS
    );
    if (!command) return new Response(null, { status: 401 });
    this.invalidateGate();
    let recoveryAdmission: Record<string, unknown> | undefined;
    if (
      !this.room.metadata &&
      command.kind === 'document-erase-apply' &&
      command.owner_id
    ) {
      this.room.metadata = {
        topic: command.topic,
        ownerId: command.owner_id,
        documentId: command.document_id,
        checkpointAt: 0,
        version: 0,
      };
    }
    if (
      !this.room.metadata ||
      command.topic !== this.room.metadata.topic ||
      command.document_id !== this.room.metadata.documentId
    )
      return new Response(null, { status: 401 });
    if (!this.room.documentPresent && command.kind === 'document-erase-apply') {
      try {
        const recovery = await this.platformEraseCall('admit', {
          operation_key: command.operation_key,
          command_nonce: command.nonce,
          doc_generation: command.doc_generation,
          lease_exp: command.lease_exp,
          recovery: true,
        });
        const bytes = z
          .array(z.number().int().min(0).max(255))
          .max(524288)
          .parse(recovery.source_state);
        if (
          recovery.allowed !== true ||
          recovery.nonce !== command.nonce ||
          recovery.operation_key !== command.operation_key ||
          recovery.doc_generation !== command.doc_generation ||
          typeof recovery.expires_at !== 'number' ||
          recovery.expires_at <= Date.now() ||
          recovery.expires_at > command.lease_exp
        )
          return Response.json({ code: 'doc_locked' }, { status: 423 });
        recoveryAdmission = recovery;
        const candidate = new Y.Doc();
        try {
          Y.applyUpdate(candidate, Uint8Array.from(bytes));
          if (
            (await documentHashes(candidate)).post_state_hash !==
            command.expected_state_hash
          )
            throw new Error('Recovery mismatch');
          const freeze = {
            operation_key: command.operation_key,
            decision: command.decision,
            state_hash: command.expected_state_hash,
            lease_exp: command.lease_exp,
          };
          const erase = { ...this.room.erase, freeze };
          await this.room.state.storage.put({
            document: Y.encodeStateAsUpdate(candidate),
            metadata: this.room.metadata,
            erase,
          });
          this.room.doc.destroy();
          this.room.doc = candidate;
          this.room.erase = erase;
          this.room.documentPresent = true;
        } catch (error) {
          candidate.destroy();
          throw error;
        }
      } catch {
        return Response.json({ code: 'doc_locked' }, { status: 423 });
      }
    }
    const nonceKey = `erase-nonce:${command.nonce}`;
    const fingerprint = await sha256(new TextEncoder().encode(raw));
    const previous = await this.room.state.storage.get<{
      fingerprint: string;
      result: unknown;
    }>(nonceKey);
    if (previous)
      return previous.fingerprint === fingerprint
        ? Response.json(
            command.kind === 'document-erase-state'
              ? await this.runEraseCommand(command)
              : previous.result
          )
        : new Response(null, { status: 409 });
    let result: unknown;
    try {
      result = await this.runEraseCommand(command, recoveryAdmission);
    } catch {
      return Response.json({ code: 'doc_locked' }, { status: 423 });
    }
    if (!result) return Response.json({ code: 'doc_locked' }, { status: 423 });
    await this.room.state.storage.put(nonceKey, {
      fingerprint,
      result:
        command.kind === 'document-erase-state' ? { state: 'read' } : result,
    });
    return Response.json(result);
  }
  async runEraseCommand(
    command: EraseCommand,
    recoveryAdmission?: Record<string, unknown>
  ) {
    const freeze = this.room.erase.freeze;
    if (freeze && freeze.operation_key !== command.operation_key) return null;
    if (command.kind === 'document-erase-state')
      return {
        state: Array.from(Y.encodeStateAsUpdate(this.room.doc)),
        ...(await documentHashes(this.room.doc)),
        installedGeneration: this.room.erase.installedGeneration,
      };
    if (command.kind === 'document-erase-freeze') {
      if (
        command.doc_generation < this.room.erase.installedGeneration ||
        command.doc_generation > this.room.erase.installedGeneration + 1
      )
        return null;
      if (
        (await documentHashes(this.room.doc)).post_state_hash !==
        command.expected_state_hash
      )
        return null;
      const erase = {
        ...this.room.erase,
        freeze: {
          operation_key: command.operation_key,
          decision: command.decision,
          state_hash: command.expected_state_hash,
          lease_exp: command.lease_exp,
        },
      };
      await this.room.state.storage.put({
        document: Y.encodeStateAsUpdate(this.room.doc),
        erase,
        ...(this.room.metadata ? { metadata: this.room.metadata } : {}),
      });
      this.room.erase = erase;
      this.room.documentAllowed = false;
      for (const socket of this.room.state.getWebSockets())
        socket.close(4423, 'doc_locked');
      await this.room.state.storage.setAlarm(command.lease_exp);
      return { state: 'frozen' };
    }
    if (
      command.kind === 'document-erase-apply' &&
      this.room.erase.appliedOperation?.operation_key ===
        command.operation_key &&
      this.room.erase.installedGeneration === command.doc_generation
    )
      return this.room.erase.appliedOperation;
    if (!freeze || freeze.operation_key !== command.operation_key) return null;
    if (command.kind === 'document-erase-apply') {
      if (
        freeze.decision !== command.decision ||
        freeze.state_hash !== command.expected_state_hash ||
        (await documentHashes(this.room.doc)).post_state_hash !==
          freeze.state_hash
      )
        return null;
      if (command.doc_generation <= this.room.erase.installedGeneration)
        return null;
      if (
        this.room.erase.appliedOperation?.operation_key ===
        command.operation_key
      )
        return this.room.erase.appliedOperation;
      const admission =
        recoveryAdmission ??
        (await this.platformEraseCall('admit', {
          operation_key: command.operation_key,
          command_nonce: command.nonce,
          doc_generation: command.doc_generation,
          lease_exp: command.lease_exp,
        }));
      if (
        admission.allowed !== true ||
        admission.nonce !== command.nonce ||
        admission.operation_key !== command.operation_key ||
        admission.doc_generation !== command.doc_generation ||
        typeof admission.expires_at !== 'number' ||
        admission.expires_at > Date.now() + 30000 ||
        admission.expires_at > command.lease_exp ||
        admission.expires_at <= Date.now() + 5000
      )
        return null;
      const applied = await applyDocumentErase(this.room.doc, command);
      if (
        command.exp * 1000 <= Date.now() ||
        command.lease_exp <= Date.now() ||
        admission.expires_at <= Date.now() + 5000
      ) {
        applied.doc.destroy();
        return null;
      }
      const erase = {
        ...this.room.erase,
        installedGeneration: command.doc_generation,
        appliedOperation: {
          operation_key: command.operation_key,
          ...applied.hashes,
        },
      };
      await this.room.state.storage.put({
        document: Y.encodeStateAsUpdate(applied.doc),
        erase,
        ...(this.room.metadata ? { metadata: this.room.metadata } : {}),
      });
      this.room.doc.destroy();
      this.room.doc = applied.doc;
      this.room.erase = erase;
      return erase.appliedOperation;
    }
    const state = documentEraseStateSchema.parse(
      await this.platformEraseCall('generation')
    );
    if (
      documentBlocked(state) ||
      state.doc_generation !== command.doc_generation ||
      this.room.erase.installedGeneration !== state.doc_generation
    )
      return null;
    const erase = { ...this.room.erase, freeze: null };
    await this.room.state.storage.put('erase', erase);
    this.room.erase = erase;
    return { state: 'released' };
  }
}
