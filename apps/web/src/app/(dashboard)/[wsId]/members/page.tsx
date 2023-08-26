import useTranslation from 'next-translate/useTranslation';
import Filters from './filters';
import InviteMemberButton from './invite-member-button';
import { getWorkspace } from '@/lib/workspace-helper';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import MemberList from './member-list';
import 'moment/locale/vi';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId?: string;
    page?: string;
    mode?: string;
    roles?: string[];
    itemsPerPage?: string;
  };
}

export default async function WorkspaceMembersPage({
  params: { wsId, page = '1', mode = 'grid', roles, itemsPerPage = '15' },
}: Props) {
  const { t } = useTranslation('ws-members');
  const ws = await getWorkspace(wsId);

  const membersLabel = t('workspace-tabs:members');

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900 md:flex-row md:items-start">
        <div>
          <h1 className="text-2xl font-bold">{membersLabel}</h1>
          <p className="text-zinc-700 dark:text-zinc-400">{t('description')}</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
          <InviteMemberButton wsId={wsId} />
          <Tabs value={'joined'}>
            <TabsList>
              <TabsTrigger value="joined">{t('joined')}</TabsTrigger>
              <TabsTrigger value="invited">{t('invited')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      <Separator className="my-4" />

      <div className="flex min-h-full w-full flex-col ">
        <Filters />
        <Separator className="mt-4" />
        {/* <PaginationIndicator
          activePage={Number(page)}
          itemsPerPage={Number(itemsPerPage)}
        /> */}

        <div
          className={`grid items-end gap-4 ${
            mode === 'grid' ? 'md:grid-cols-2' : ''
          }`}
        >
          <MemberList
            wsId={wsId}
            role={ws.role}
            page={page}
            roles={roles}
            itemsPerPage={itemsPerPage}
          />
        </div>
      </div>
    </>
  );
}
