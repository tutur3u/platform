import { parseChangelog, type Changelog } from './schema.ts';

// Eager JSON embedding adds no runtime fetch; an absent artifact hides the section.
const artifacts = import.meta.glob('../../.generated/changelog.json', {
  eager: true,
  import: 'default',
});
export const changelog: Changelog | null = parseChangelog(
  Object.values(artifacts)[0] ?? null
);
