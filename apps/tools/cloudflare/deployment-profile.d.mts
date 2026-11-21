export const ABUSE_GUARD_SERVICE: Readonly<{
  binding: 'ABUSE_GUARD';
  service: 'tuturuuu-abuse-guard';
  entrypoint: 'AbuseGuardEntrypoint';
}>;
export const ABUSE_GUARD_FAMILIES: 'proxy';
export function deploymentProfile(value?: string): {
  name: string;
  vars: { TUTURUUU_NOINDEX: string; ABUSE_GUARD_FAMILIES: string };
  services: { binding: string; service: string; entrypoint: string }[];
};
