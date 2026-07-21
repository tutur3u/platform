import { ContactChannels } from './contact-channels';
import { ContactClosing } from './contact-closing';
import { ContactExchange } from './contact-exchange';
import { ContactHero } from './contact-hero';

/**
 * Contact page.
 *
 * Composition only — every section lives in its own file and is built from the
 * landing page's shared kit (`SectionShell`, `SurfaceCard`, `Reveal`,
 * atmosphere), so this page reads as part of the same object as the rest of
 * marketing rather than a separate visual dialect.
 */
export default function ContactPage() {
  return (
    <main className="relative w-full overflow-x-hidden">
      <ContactHero />
      <ContactChannels />
      <ContactExchange />
      <ContactClosing />
    </main>
  );
}
