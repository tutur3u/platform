import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { Button } from '@repo/ui/components/ui/button';
import { Mail } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';

export default function EmailButton({
  url,
  plan,
}: {
  url: string;
  plan: MeetTogetherPlan;
}) {
  const { t } = useTranslation('meet-together-plan-details');

  return (
    <Link
      href={
        url
          ? `mailto:?subject=${t('common:meet-together')}: ${plan.name}&body=${t('mail_p1')},%0A%0A${t('mail_p2')} "${plan.name}".%0A%0A${t('mail_p3')} ${url} ${t('mail_p4')}.%0A%0A${t('mail_p5')}!`
          : '#'
      }
      target="_blank"
    >
      <Button variant="outline" disabled={!url}>
        <Mail className="mr-1 h-5 w-5" />
        {t('send_email')}
      </Button>
    </Link>
  );
}
