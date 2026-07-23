import { DefenceGrid } from './components/defence-grid';
import { DisclosureSection } from './components/disclosure-section';
import { SecurityHero } from './components/security-hero';
import { TrustSection } from './components/trust-section';

/**
 * Security — the controls, how to report a hole in them, and how we behave
 * when someone finds one.
 *
 * Rebuilt from a single 480-line client component into server sections on the
 * shared marketing kit. The old grid coloured its cards with interpolated
 * `dynamic-${color}` classes, which Tailwind never emits, so none of those
 * accents were reaching the page; `SurfaceCard`'s static maps fix that.
 */
export default function SecurityPage() {
  return (
    <main className="relative w-full overflow-x-hidden">
      <SecurityHero />
      <DefenceGrid />
      <DisclosureSection />
      <TrustSection />
    </main>
  );
}
