'use client';

import { Tabs, TabsList } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type { MemberStatus } from './members-queries';
import TabNavigation from './tab-navigation';

interface Props {
  value?: MemberStatus;
}

export default function MemberTabs({ value }: Props) {
  const t = useTranslations();

  return (
    <Tabs value={value} defaultValue="all" className="w-full">
      <TabsList className="grid w-full grid-cols-3 text-sm md:flex md:w-auto md:text-base">
        <TabNavigation value="all" label={t('ws-members.all')} />
        <TabNavigation value="joined" label={t('ws-members.joined')} />
        <TabNavigation value="invited" label={t('ws-members.invited')} />
      </TabsList>
    </Tabs>
  );
}
