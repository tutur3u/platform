/** Publication date requires verification of the live legal revision. */
export const MEET_AI_LEGAL_REVISION: { date: string | null } = { date: null };

export function meetAiLegalLinks(locale: string, webAppUrl: string) {
  const prefix = locale === 'vi' ? '/vi' : '';
  const base = webAppUrl.replace(/\/$/, '');
  return {
    privacy: `${base}${prefix}/privacy`,
    terms: `${base}${prefix}/terms`,
    subprocessors: `${base}${prefix}/legal/subprocessors`,
  };
}
