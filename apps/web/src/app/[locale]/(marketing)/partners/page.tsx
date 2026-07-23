import {
  FeaturedPartners,
  PartnerRoster,
  PartnersClosing,
  PartnersHero,
} from './components/partners-sections';

/**
 * Partners — who we build alongside.
 *
 * Rebuilt from a 1,000-line client component (nine always-running
 * `motion.div` background orbs among them) into server sections on the shared
 * marketing kit, with the roster extracted to data.
 */
export default function PartnersPage() {
  return (
    <main className="relative w-full overflow-x-hidden">
      <PartnersHero />
      <FeaturedPartners />
      <PartnerRoster />
      <PartnersClosing />
    </main>
  );
}
