import { Mail, Shield } from '@tuturuuu/icons/lucide';
import { ActionLink } from '@/components/marketing/action-link';
import { PageHero } from '@/components/marketing/page-hero';
import { DefenceRings } from './defence-rings';

export function SecurityHero() {
  return (
    <PageHero
      accent="blue"
      actions={
        <>
          <ActionLink href="#report">Report a vulnerability</ActionLink>
          <ActionLink href="/security/policy" variant="ghost">
            <Mail className="h-4 w-4" />
            Security policy
          </ActionLink>
        </>
      }
      description="Your data is protected in transit, at rest, and at every boundary in between. Here is how, and how to tell us when we have got something wrong."
      eyebrow="Security"
      eyebrowIcon={Shield}
      highlight="secured"
      title="Every layer,"
    >
      <DefenceRings />
    </PageHero>
  );
}
