/** Routed QA domain, deliberately outside all staff-email allowlists. */
export function isTuturuuuReviewEmail(email) {
  return (
    typeof email === 'string' && /^[^\s@]+@tutur3u\.com$/i.test(email.trim())
  );
}
