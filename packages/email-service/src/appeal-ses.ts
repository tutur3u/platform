import { createHash } from 'node:crypto';
import {
  GetAccountCommand,
  GetConfigurationSetCommand,
  GetEmailIdentityCommand,
  GetSuppressedDestinationCommand,
  NotFoundException,
  SendEmailCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { z } from 'zod';
import { confirmationContent } from './appeal-template';
import type {
  AppealBinding,
  AppealTransport,
  ConfirmationInput,
  SuppressionLookup,
} from './appeal-transport';

const suppressionSchema = z.object({
  EmailAddress: z.email(),
  Reason: z.enum(['BOUNCE', 'COMPLAINT']),
  LastUpdateTime: z.date(),
});
export type AccountSuppression =
  | { kind: 'clear' }
  | { kind: 'suppressed'; reason: 'BOUNCE' | 'COMPLAINT'; updatedAt: string }
  | { kind: 'unknown' };

export type AppealSesPort = {
  accountId(): Promise<string | undefined>;
  healthy(): Promise<boolean>;
  qualifiedIdentity(identity: string): Promise<boolean>;
  qualifiedConfiguration(name: string, pool: string): Promise<boolean>;
  suppression(email: string): Promise<AccountSuppression>;
  send(input: SendEmailCommand): Promise<unknown>;
};

export function createAppealSesPort(input: {
  region: string;
  credentials: { accessKeyId: string; secretAccessKey: string };
}): AppealSesPort {
  const options = { ...input, maxAttempts: 1 };
  const ses = new SESv2Client({
    ...options,
    endpoint: `https://email.${input.region}.amazonaws.com`,
  });
  const sts = new STSClient({
    ...options,
    endpoint: `https://sts.${input.region}.amazonaws.com`,
  });
  const timeout = () => ({ abortSignal: AbortSignal.timeout(3000) });
  return {
    async accountId() {
      return (await sts.send(new GetCallerIdentityCommand({}), timeout()))
        .Account;
    },
    async healthy() {
      const account = await ses.send(new GetAccountCommand({}), timeout());
      return (
        account.SendingEnabled === true &&
        account.ProductionAccessEnabled === true &&
        account.EnforcementStatus === 'HEALTHY'
      );
    },
    async qualifiedIdentity(identity) {
      const value = await ses.send(
        new GetEmailIdentityCommand({ EmailIdentity: identity }),
        timeout()
      );
      return (
        value.VerifiedForSendingStatus === true &&
        value.DkimAttributes?.Status === 'SUCCESS'
      );
    },
    async qualifiedConfiguration(name, pool) {
      const value = await ses.send(
        new GetConfigurationSetCommand({ ConfigurationSetName: name }),
        timeout()
      );
      const reasons = value.SuppressionOptions?.SuppressedReasons;
      return (
        value.ConfigurationSetName === name &&
        value.SendingOptions?.SendingEnabled === true &&
        value.DeliveryOptions?.SendingPoolName === pool &&
        !value.TrackingOptions?.CustomRedirectDomain &&
        (!reasons ||
          (reasons.includes('BOUNCE') && reasons.includes('COMPLAINT')))
      );
    },
    async suppression(email) {
      try {
        const value = await ses.send(
          new GetSuppressedDestinationCommand({ EmailAddress: email }),
          timeout()
        );
        const parsed = suppressionSchema.safeParse(value.SuppressedDestination);
        if (
          !parsed.success ||
          parsed.data.EmailAddress.toLowerCase() !== email.toLowerCase()
        )
          return { kind: 'unknown' };
        return {
          kind: 'suppressed',
          reason: parsed.data.Reason,
          updatedAt: parsed.data.LastUpdateTime.toISOString(),
        };
      } catch (error) {
        return error instanceof NotFoundException &&
          error.$metadata.httpStatusCode === 404
          ? { kind: 'clear' }
          : { kind: 'unknown' };
      }
    },
    async send(command) {
      return ses.send(command, timeout());
    },
  };
}

export function createSesAppealTransport(
  binding: AppealBinding,
  dependencies: {
    source: AppealSesPort;
    recovery: AppealSesPort;
    isActive(): Promise<boolean>;
    authorizeDispatch(input: ConfirmationInput): Promise<boolean>;
  }
): AppealTransport {
  async function qualified() {
    if (!(await dependencies.isActive())) return false;
    const sourceId = await dependencies.source.accountId();
    const recoveryId = await dependencies.recovery.accountId();
    if (
      sourceId !== binding.sourceAccountId ||
      recoveryId !== binding.accountId ||
      sourceId === recoveryId
    )
      return false;
    return (
      (await dependencies.source.healthy()) &&
      (await dependencies.recovery.healthy()) &&
      (await dependencies.recovery.qualifiedIdentity(binding.identity)) &&
      (await dependencies.recovery.qualifiedConfiguration(
        binding.configurationSet,
        binding.ipPool
      )) &&
      (await dependencies.isActive())
    );
  }
  async function lookupSuppression(email: string): Promise<SuppressionLookup> {
    try {
      if (!z.email().safeParse(email).success || !(await qualified()))
        return { status: 'unknown', hardBounce: false };
      const source = await dependencies.source.suppression(email);
      const recovery = await dependencies.recovery.suppression(email);
      if (source.kind === 'unknown' || recovery.kind === 'unknown')
        return { status: 'unknown', hardBounce: false };
      const generation = createHash('sha256')
        .update(
          JSON.stringify({
            sourceAccountId: binding.sourceAccountId,
            sourceRegion: binding.sourceRegion,
            accountId: binding.accountId,
            region: binding.region,
            email,
            source,
            recovery,
          })
        )
        .digest('hex');
      if (recovery.kind === 'suppressed')
        return {
          status: 'blocked',
          hardBounce: recovery.reason === 'BOUNCE',
          accountId: binding.accountId,
          region: binding.region,
          generation,
        };
      return {
        status: 'eligible',
        hardBounce: source.kind === 'suppressed' && source.reason === 'BOUNCE',
        source:
          source.kind === 'clear'
            ? 'clear'
            : source.reason === 'BOUNCE'
              ? 'bounce'
              : 'complaint',
        generation,
      };
    } catch {
      return { status: 'unknown', hardBounce: false };
    }
  }
  return {
    binding,
    lookupSuppression,
    async sendConfirmation(input) {
      // Only a durable recipient-owned dispatch claim can reach this effect.
      try {
        const content = confirmationContent(binding, input);
        const suppression = await lookupSuppression(input.email);
        if (
          !z.uuid().safeParse(input.dispatchId).success ||
          suppression.status !== 'eligible' ||
          suppression.generation !== input.providerGeneration ||
          !(await dependencies.authorizeDispatch(input)) ||
          !(await dependencies.isActive())
        )
          return { status: 'rejected' };
        const command = new SendEmailCommand({
          FromEmailAddress: binding.identity,
          Destination: { ToAddresses: [input.email] },
          ConfigurationSetName: binding.configurationSet,
          Content: { Simple: content },
          EmailTags: [
            { Name: 'appeal_id', Value: input.appealId },
            { Name: 'workspace_id', Value: input.wsId },
            { Name: 'appeal_dispatch_id', Value: input.dispatchId },
            { Name: 'appeal_dispatch_kind', Value: 'confirmation' },
          ],
        });
        const response = await dependencies.recovery.send(command);
        const parsed = z
          .object({ MessageId: z.string().min(1).max(200) })
          .safeParse(response);
        return parsed.success
          ? { status: 'accepted', messageId: parsed.data.MessageId }
          : { status: 'unknown' };
      } catch {
        // The provider may have accepted an interrupted request; retain its claim.
        return { status: 'unknown' };
      }
    },
  };
}
