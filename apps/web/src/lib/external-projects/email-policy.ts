import type { Json } from '@tuturuuu/types';
import { z } from 'zod';

export const EXTERNAL_PROJECT_EMAIL_POLICY_KEY = 'outboundEmail';

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .refine(
    (domain) =>
      /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(
        domain
      ),
    'Enter a valid domain such as example.com'
  );

export const externalProjectEmailPolicySchema = z.object({
  allowedRecipientDomains: z
    .array(domainSchema)
    .max(50)
    .transform((domains) => [...new Set(domains)]),
  enabled: z.boolean(),
  useRootWorkspaceCredentials: z.boolean(),
});

export type ExternalProjectEmailPolicy = z.infer<
  typeof externalProjectEmailPolicySchema
>;

export const DEFAULT_EXTERNAL_PROJECT_EMAIL_POLICY = {
  allowedRecipientDomains: [],
  enabled: false,
  useRootWorkspaceCredentials: false,
} satisfies ExternalProjectEmailPolicy;

function asRecord(value: Json | null | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

export function readExternalProjectEmailPolicy(
  settings: Json | null | undefined
): ExternalProjectEmailPolicy {
  const parsed = externalProjectEmailPolicySchema.safeParse(
    asRecord(settings)[EXTERNAL_PROJECT_EMAIL_POLICY_KEY]
  );

  return parsed.success ? parsed.data : DEFAULT_EXTERNAL_PROJECT_EMAIL_POLICY;
}

export function writeExternalProjectEmailPolicy(
  settings: Json | null | undefined,
  policy: ExternalProjectEmailPolicy
): Json {
  return {
    ...asRecord(settings),
    [EXTERNAL_PROJECT_EMAIL_POLICY_KEY]:
      externalProjectEmailPolicySchema.parse(policy),
  };
}

function recipientDomain(email: string) {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

export function listDisallowedRecipientDomains(
  recipients: string[],
  policy: ExternalProjectEmailPolicy
) {
  const allowed = new Set(policy.allowedRecipientDomains);
  return [
    ...new Set(
      recipients.map(recipientDomain).filter((domain) => !allowed.has(domain))
    ),
  ];
}
