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
                dkimVerified: claim.dkimVerified,
                dnsRecords: claim.dnsRecords,
                mailFromVerified: claim.mailFromVerified,
                subdomain: claim.subdomain,
                txtVerified: claim.txtVerified,
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
