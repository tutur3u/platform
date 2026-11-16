import { sendSystemEmail } from '@tuturuuu/email-service';
import { z } from 'zod';
import type { LiveMintBudgetAlert } from './mint-cap';

const recipientSchema = z
  .string()
  .max(254)
  .regex(/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@tuturuuu\.com$/i);
const recipientsSchema = z.array(recipientSchema).max(20);
const eventSchema = z.object({
  threshold: z.union([z.literal(80), z.literal(100)]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reservedMicroUsd: z.number().int().nonnegative().safe(),
  limitMicroUsd: z.number().int().positive().safe(),
});

export type LiveMintAlertOutcome =
  | 'accepted'
  | 'failed'
  | 'unknown'
  | 'unconfigured'
  | 'invalid_config';

export function readLiveMintAlertRecipients(
  value = process.env.LIVE_FREE_BUDGET_ALERT_RECIPIENTS ?? '[]'
): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid Live alert recipient configuration');
  }
  return [
    ...new Set(
      recipientsSchema.parse(parsed).map((recipient) => recipient.toLowerCase())
    ),
  ];
}

function dollars(microUsd: number): string {
  const value = BigInt(microUsd);
  return `${value / 1_000_000n}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
}

// Called only after the atomic ledger claims this day/threshold. No caller or
// failure path retries an outward attempt; accepted is not delivery confirmation.
export async function sendLiveMintBudgetAlert(
  input: LiveMintBudgetAlert,
  {
    recipientConfig,
    send = sendSystemEmail,
  }: {
    recipientConfig?: string;
    send?: typeof sendSystemEmail;
  } = {}
): Promise<LiveMintAlertOutcome> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) {
    console.error('live_mint_budget_alert_invalid_event');
    return 'invalid_config';
  }
  const event = parsed.data;
  let recipients: string[];
  try {
    recipients = readLiveMintAlertRecipients(recipientConfig);
  } catch {
    console.error('live_mint_budget_alert_invalid_recipients', {
      day: event.day,
      threshold: event.threshold,
    });
    return 'invalid_config';
  }
  if (recipients.length === 0) {
    console.error('live_mint_budget_alert_unsent_empty_recipients', event);
    return 'unconfigured';
  }
  try {
    const result = await send({
      recipients: { to: recipients },
      content: {
        subject: `Live FREE daily budget ${event.threshold}% — ${event.day} ICT`,
        html: `<p>FREE Live daily reservation budget alert for ${event.day} (Asia/Ho_Chi_Minh).</p><p>Reserved USD ${dollars(event.reservedMicroUsd)} of USD ${dollars(event.limitMicroUsd)}.</p><p>${event.threshold === 100 ? 'The next full session reservation cannot fit or the budget is exhausted. New FREE sessions are refused until the next ICT day.' : 'At least 80% of the daily budget has been reserved.'}</p><p>This is conservative lease reservation accounting, not a measured provider invoice. No client-reported early refund is applied.</p>`,
      },
      metadata: { templateType: 'live-budget-alert' },
    });
    const outcome: LiveMintAlertOutcome =
      result.deliveryOutcome === 'unknown'
        ? 'unknown'
        : result.success && result.deliveryOutcome !== 'rejected'
          ? 'accepted'
          : 'failed';
    if (outcome !== 'accepted')
      console.error('live_mint_budget_alert_unsent', {
        day: event.day,
        threshold: event.threshold,
        outcome,
      });
    return outcome;
  } catch {
    console.error('live_mint_budget_alert_outcome_unknown', {
      day: event.day,
      threshold: event.threshold,
    });
    return 'unknown';
  }
}
