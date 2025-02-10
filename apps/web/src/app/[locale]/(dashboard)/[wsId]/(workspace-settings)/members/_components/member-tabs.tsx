import TabNavigation from './tab-navigation';
import { Tabs, TabsList } from '@tutur3u/ui/components/ui/tabs';
import { getTranslations } from 'next-intl/server';

interface Props {
  value?: string;
}

export default async function MemberTabs({ value }: Props) {
  const t = await getTranslations();

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
