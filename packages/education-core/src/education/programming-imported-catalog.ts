/** Immutable identities for the three audited former hardcoded platform fixtures.
 * Never add workspace-authored slugs here; used only for unbound legacy history. */
const importedGlobalProblems = {
  'ca13cfe6-4e26-4dc0-908a-d5c0b37dc7f1': 'two-sum',
  '0d7a547a-c8c0-4061-884f-abc2e6058548': 'binary-search',
  'c7ce91a7-0aff-4097-90d2-716c17fa52d1': 'balanced-brackets',
} as const;
export function importedProgrammingSlug(problemId: string): string | undefined {
  return Object.hasOwn(importedGlobalProblems, problemId)
    ? importedGlobalProblems[problemId as keyof typeof importedGlobalProblems]
    : undefined;
}
