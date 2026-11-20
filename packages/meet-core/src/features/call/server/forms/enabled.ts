import 'server-only';

export function isMeetFormsEnabled() {
  return process.env.MEET_FORMS_ENABLED === 'true';
}
