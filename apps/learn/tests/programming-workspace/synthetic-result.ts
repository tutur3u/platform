/** Test-only markers distinguish actual result renders; they do not prove judging. */
export function syntheticSubmissionId(ordinal: number) {
  return `22222222-2222-4222-8222-${String(ordinal).padStart(12, '0')}`;
}

export function syntheticSubmissionOutput({
  ordinal,
  challengeSlug,
  kind,
  output,
}: {
  ordinal: number;
  challengeSlug: string;
  kind: string;
  output: string;
}) {
  return `Synthetic attempt ${ordinal} ${syntheticSubmissionId(ordinal)} ${challengeSlug}/${kind}\n${output}`;
}

/** Serialized directly into Playwright's page.waitForFunction. */
export function hasFreshSyntheticOutput(expectedOutput: string) {
  return Array.from(document.querySelectorAll('[role="tabpanel"] pre')).some(
    (element) => element.textContent === expectedOutput
  );
}
