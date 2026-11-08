import { readNewsletterClaim } from '@/lib/newsletter/service';
import NewsletterSettingsForm from './newsletter-settings-form';

export default async function NewsletterSettings({ wsId }: { wsId: string }) {
  try {
    const { claim, gate } = await readNewsletterClaim(wsId);
    return (
      <NewsletterSettingsForm
        allowed={gate.allowed}
        claim={
          claim
            ? {
                approval: claim.approval,
                dnsRecords: claim.dnsRecords,
                subdomain: claim.subdomain,
              }
            : null
        }
        loadError={false}
        wsId={wsId}
      />
    );
  } catch {
    return (
      <NewsletterSettingsForm
        allowed={false}
        claim={null}
        loadError
        wsId={wsId}
      />
    );
  }
}
