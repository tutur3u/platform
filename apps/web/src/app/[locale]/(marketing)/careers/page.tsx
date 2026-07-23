import {
  BenefitsSection,
  CareersClosing,
  CareersHero,
  CultureSection,
  RolesSection,
  SystemsSection,
  ValuesSection,
} from './components/careers-sections';

/**
 * Careers — what we are building, how we work, and where we need people.
 *
 * Rebuilt from a 1,060-line client component into server sections on the
 * shared marketing kit. The old page styled every card with interpolated
 * `dynamic-${color}` classes — eighteen of them — so none of its accents ever
 * reached the stylesheet.
 */
export default function CareersPage() {
  return (
    <main className="relative w-full overflow-x-hidden">
      <CareersHero />
      <ValuesSection />
      <CultureSection />
      <SystemsSection />
      <RolesSection />
      <BenefitsSection />
      <CareersClosing />
    </main>
  );
}
