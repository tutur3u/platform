import { AnalyticsSection } from './components/analytics-section';
import { ContributorGrid } from './components/contributor-grid';
import {
  ContributorsClosing,
  ContributorsHero,
} from './components/contributors-hero';
import { getRepoSnapshot } from './components/github-data';

/**
 * Contributors — everyone with commits in the repository.
 *
 * Rebuilt from an 814-line client component. Two defects came out with it: the
 * data was fetched in `useEffect` (which this repo forbids) across roughly
 * twenty-seven sequential unauthenticated GitHub calls per visit against a
 * sixty-per-hour limit, and two of the three charts were generated with
 * `Math.random()` and captioned as repository analytics. Fetching now happens
 * once on the server, and every number on the page comes from GitHub.
 */
export default async function ContributorsPage() {
  const snapshot = await getRepoSnapshot();

  return (
    <main className="relative w-full overflow-x-hidden">
      <ContributorsHero snapshot={snapshot} />
      <ContributorGrid contributors={snapshot.contributors} />
      <AnalyticsSection contributors={snapshot.contributors} />
      <ContributorsClosing />
    </main>
  );
}
