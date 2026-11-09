import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  createAppealSesPort,
  createSesAppealTransport,
} from '@tuturuuu/email-service/appeal-ses';
import {
  bindingToDatabase,
  parseDatabaseBinding,
} from '@tuturuuu/email-service/appeal-transport';
import type {
  AppealBinding,
  AppealTransport,
  ConfirmationInput,
} from '@tuturuuu/email-service/appeal-transport';
import type { Json } from '@tuturuuu/types';
import { z } from 'zod';

export type { AppealTransport } from '@tuturuuu/email-service/appeal-transport';

type TransportSchema = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
    Functions: {
      email_appeal_transport_binding: {
        Args: Record<never, never>;
        Returns: Json;
      };
      email_appeal_feedback_bindings: {
        Args: Record<never, never>;
        Returns: Json;
      };
      email_appeal_authorize_dispatch: {
        Args: {
          p_id: string;
          p_dispatch_id: string;
          p_ws_id: string;
          p_email: string;
          p_generation: string;
          p_provider_generation: string;
          p_binding: Json;
        };
        Returns: boolean;
      };
    };
  };
};

export async function readActiveAppealFeedbackBindings() {
  // Late authenticated feedback must still revoke consent after sending is stopped.
  try {
    const admin = await createAdminClient<TransportSchema>({ noCookie: true });
    const { data, error } = await admin.rpc(
      'email_appeal_feedback_bindings',
      {}
    );
    const rows = z
      .array(
        z.object({
          account_id: z.string().regex(/^\d{12}$/),
          region: z.string(),
          identity: z.email(),
          configuration_set: z.string().min(1),
        })
      )
      .max(32)
      .safeParse(data);
    if (error || !rows.success) return [];
    return rows.data.map((row) => ({
      accountId: row.account_id,
      region: row.region,
      identity: row.identity,
      configurationSet: row.configuration_set,
    }));
  } catch {
    return [];
  }
}

export async function readActiveAppealBinding(): Promise<AppealBinding | null> {
  // The operational grant is separate from source publication and feature rollout.
  if (process.env.EMAIL_APPEAL_TRANSPORT_STOP !== '0') return null;
  const grantId = process.env.EMAIL_APPEAL_PROVIDER_GRANT_ID;
  if (!grantId) return null;
  try {
    const admin = await createAdminClient<TransportSchema>({ noCookie: true });
    const { data, error } = await admin.rpc(
      'email_appeal_transport_binding',
      {}
    );
    const binding = error ? null : parseDatabaseBinding(data);
    return binding?.grantId === grantId ? binding : null;
  } catch {
    return null;
  }
}

function sameBinding(left: AppealBinding | null, right: AppealBinding) {
  return (
    left !== null &&
    JSON.stringify(bindingToDatabase(left)) ===
      JSON.stringify(bindingToDatabase(right))
  );
}

async function authorizeDispatch(
  binding: AppealBinding,
  input: ConfirmationInput
) {
  if (!sameBinding(await readActiveAppealBinding(), binding)) return false;
  try {
    const admin = await createAdminClient<TransportSchema>({ noCookie: true });
    const { data, error } = await admin.rpc('email_appeal_authorize_dispatch', {
      p_id: input.appealId,
      p_dispatch_id: input.dispatchId,
      p_ws_id: input.wsId,
      p_email: input.email,
      p_generation: input.generation,
      p_provider_generation: input.providerGeneration,
      p_binding: bindingToDatabase(binding),
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function getAppealTransport(): Promise<AppealTransport | null> {
  const binding = await readActiveAppealBinding();
  if (!binding) return null;
  const accessKeyId = process.env.EMAIL_APPEAL_RECOVERY_ACCESS_KEY_ID;
  const secretAccessKey = process.env.EMAIL_APPEAL_RECOVERY_SECRET_ACCESS_KEY;
  const sourceAccessKeyId = process.env.EMAIL_APPEAL_SOURCE_ACCESS_KEY_ID;
  const sourceSecretAccessKey =
    process.env.EMAIL_APPEAL_SOURCE_SECRET_ACCESS_KEY;
  if (
    !accessKeyId ||
    !secretAccessKey ||
    !sourceAccessKeyId ||
    !sourceSecretAccessKey
  )
    return null;
  return createSesAppealTransport(binding, {
    source: createAppealSesPort({
      region: binding.sourceRegion,
      credentials: {
        accessKeyId: sourceAccessKeyId,
        secretAccessKey: sourceSecretAccessKey,
      },
    }),
    recovery: createAppealSesPort({
      region: binding.region,
      credentials: { accessKeyId, secretAccessKey },
    }),
    isActive: async () => sameBinding(await readActiveAppealBinding(), binding),
    authorizeDispatch: async (input) => authorizeDispatch(binding, input),
  });
}
