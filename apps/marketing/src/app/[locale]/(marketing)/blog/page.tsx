import {
  BlogCategories,
  BlogChannels,
  BlogHero,
  PlannedPosts,
} from './components/blog-sections';

/**
 * Blog — nothing published yet, said plainly.
 *
 * Rebuilt from a 520-line client component. The old page closed on an email
 * capture that was markup only: an unwired input and a button with no handler,
 * under a promise you could unsubscribe from a list that was never created.
 * The replacement points at the changelog, the repository and contact, all of
 * which go somewhere.
 */
export default function BlogPage() {
  return (
    <main className="relative w-full overflow-x-hidden">
      <BlogHero />
      <BlogCategories />
      <PlannedPosts />
      <BlogChannels />
    </main>
  );
}
