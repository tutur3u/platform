import TabNavigation from './tab-navigation';
import { Tabs, TabsList } from '@repo/ui/components/ui/tabs';
import { getTranslations } from 'next-intl/server';

interface Props {
  value?: string;
}

export default async function MemberTabs({ value }: Props) {
  const t = await getTranslations('ws-members');

  const allLabel = t('all');
  const joinedLabel = t('joined');
  const invitedLabel = t('invited');

  return (
    <Tabs value={value} defaultValue="all">
      <TabsList>
        <TabNavigation value="all" label={allLabel} />
        <TabNavigation value="joined" label={joinedLabel} />
        <TabNavigation value="invited" label={invitedLabel} />
      </TabsList>
    </Tabs>
  );
}
