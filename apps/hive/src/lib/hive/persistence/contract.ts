import type { Json } from '@tuturuuu/types/db';
import { z } from 'zod';
import type { HiveWorld } from '../types';

export const hiveOperationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
  .brand<'HiveOperationId'>();

export type HiveOperationId = z.infer<typeof hiveOperationIdSchema>;

export type HiveWorldWriter = Readonly<{
  kind: 'world';
  serverId: string;
}>;

export type HiveEconomyWriter = Readonly<{
  kind: 'economy';
  serverId: string;
}>;

export type HiveWriter = HiveWorldWriter | HiveEconomyWriter;

export type HiveWorldEventCommand = Readonly<{
  kind: 'world-event';
  operationId: HiveOperationId;
  writer: HiveWorldWriter;
  actorUserId: string | null;
  eventType: string;
  payload: Readonly<Record<string, Json>>;
  researchSessionId: string | null;
  world: HiveWorld;
}>;

export type HiveTradeCommand = Readonly<{
  kind: 'accept-trade';
  operationId: HiveOperationId;
  writer: HiveEconomyWriter;
  actorUserId: string;
  tradeId: string;
  acceptingNpcId: string;
}>;

export type HiveWriteCommand = HiveWorldEventCommand | HiveTradeCommand;

export type HiveWorldEventReceipt = Readonly<{
  kind: 'world-event';
  operationId: HiveOperationId;
  writer: HiveWorldWriter;
  eventId: string;
  sequence: number;
}>;

export type HiveTradeReceipt = Readonly<{
  kind: 'accept-trade';
  operationId: HiveOperationId;
  writer: HiveEconomyWriter;
  tradeId: string;
  ledgerId: string;
}>;

export type HiveWriteReceipt = HiveWorldEventReceipt | HiveTradeReceipt;

export type HiveWriteRejection =
  | 'operation-conflict'
  | 'trade-not-open'
  | 'wrong-recipient'
  | 'insufficient-funds';

export type HiveTerminalRejection = Exclude<
  HiveWriteRejection,
  'operation-conflict'
>;

export type HiveTerminalOutcome =
  | { status: 'committed'; receipt: HiveWriteReceipt }
  | { status: 'rejected'; reason: HiveTerminalRejection };

export type HiveOperationIdentity = Readonly<{
  operationId: HiveOperationId;
  writer: HiveWriter;
}>;

export type HiveWriteResult =
  | { status: 'committed'; replayed: boolean; receipt: HiveWriteReceipt }
  | { status: 'rejected'; reason: HiveWriteRejection }
  | { status: 'unknown'; identity: HiveOperationIdentity };

export type HiveOperationObservation =
  | HiveTerminalOutcome
  | { status: 'unresolved'; identity: HiveOperationIdentity };

/**
 * One authoritative writer owns each scope. Snapshot/event/sequence or
 * trade/wallets/ledger plus the operation receipt commit atomically there.
 * The adapter compares the immutable command on replay, not only its ID.
 * Business rejections are durable terminal outcomes too. Replays retain them;
 * conflicting input never replaces the original outcome.
 * A transport failure returns unknown; observe that identity before retrying.
 * An unresolved observation never authorizes redispatch with a new identity.
 */
export interface HivePersistencePort {
  commit(command: HiveWriteCommand): Promise<HiveWriteResult>;
  observe(identity: HiveOperationIdentity): Promise<HiveOperationObservation>;
}
