import { Button } from '@repo/ui/components/ui/button';
import { MeetTogetherPlan } from '@tutur3u/types/primitives/MeetTogetherPlan';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function EmailButton({
  url,
  plan,
}: {
  url: string;
  plan: MeetTogetherPlan;
}) {
  const t = useTranslations();

  return (
    <Link
      href={
        url
          ? `mailto:?subject=${t('common.meet-together')}: ${plan.name}&body=${t('meet-together-plan-details.mail_p1')},%0A%0A${t('meet-together-plan-details.mail_p2')} "${plan.name}".%0A%0A${t('meet-together-plan-details.mail_p3')} ${url} ${t('meet-together-plan-details.mail_p4')}.%0A%0A${t('meet-together-plan-details.mail_p5')}!`
          : '#'
      }
      target="_blank"
      className="hidden md:block"
    >
      <Button variant="outline" disabled={!url}>
        <Mail className="mr-1 h-5 w-5" />
        {t('meet-together-plan-details.send_email')}
      </Button>
    </Link>
  );
}
