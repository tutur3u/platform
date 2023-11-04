import { Separator } from '@/components/ui/separator';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { Database } from '@/types/supabase';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';

interface Props {
  params: {
    wsId: string;
    userId: string;
  };
}

export default async function WorkspaceUserDetailsPage({ params }: Props) {
  const { t } = useTranslation('user-data-table');
  const data = await getData(params);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid h-fit gap-8 md:grid-cols-2">
        <div className="grid h-fit gap-2">
          <div className="text-2xl font-semibold">Thông tin cơ bản</div>
          <Separator />
          <div className="border-border bg-foreground/5 rounded border p-2">
            {data.display_name && (
              <div>
                <span className="opacity-60">Tên hiển thị:</span>{' '}
                {data.display_name}
              </div>
            )}

            {data.full_name && (
              <div>
                <span className="opacity-60">Tên đầy đủ:</span> {data.full_name}
              </div>
            )}

            {data.birthday && (
              <div>
                <span className="opacity-60">Ngày sinh:</span>{' '}
                {t(data.birthday)}
              </div>
            )}

            {data.gender && (
              <div>
                <span className="opacity-60">Giới tính:</span> {t(data.gender)}
              </div>
            )}
          </div>

          <div className="border-border bg-foreground/5 rounded border p-2">
            {data.email && (
              <div>
                <span className="opacity-60">Email:</span> {data.email}
              </div>
            )}
            {data.phone && (
              <div>
                <span className="opacity-60">SĐT:</span> {data.phone}
              </div>
            )}
          </div>

          <div className="border-border bg-foreground/5 rounded border p-2">
            <span className="opacity-60">Tạo lúc:</span>{' '}
            {data.created_at
              ? moment(data.created_at).format('DD/MM/YYYY, HH:mm:ss')
              : '-'}
          </div>
        </div>

        {/* <div className="grid h-fit gap-2">
          <div className="text-2xl font-semibold">Nhóm đã tham gia</div>
          <Separator />
          <div className="border-border bg-foreground/5 rounded border p-2">
            <div>
              <span className="opacity-60">Nhóm đã tham gia</span>
            </div>
          </div>
        </div> */}

        {/* <div className="grid h-fit gap-2">
          <div className="text-2xl font-semibold">Mã giảm giá liên kết</div>
          <Separator />
          <div className="border-border bg-foreground/5 rounded border p-2">
            <div>
              <span className="opacity-60">Mã giảm giá liên kết</span>
            </div>
          </div>
        </div> */}

        {/* <div className="grid h-fit gap-2">
          <div className="text-2xl font-semibold">Hoá đơn</div>
          <Separator />
          <div className="border-border bg-foreground/5 rounded border p-2">
            <div>
              <span className="opacity-60">Hoá đơn</span>
            </div>
          </div>
        </div> */}
      </div>
    </div>
  );
}

async function getData({ wsId, userId }: { wsId: string; userId: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_users')
    .select(
      '*, linked_users:workspace_user_linked_users(platform_user_id, users(display_name, workspace_members!inner(user_id, ws_id)))'
    )
    .eq('ws_id', wsId)
    .eq('id', userId)
    .eq('linked_users.users.workspace_members.ws_id', wsId)
    .single();

  const { data: rawData, error } = await queryBuilder;
  if (error) throw error;

  const data = {
    ...rawData,
    linked_users: rawData.linked_users
      .map(
        ({
          platform_user_id,
          users,
        }: {
          platform_user_id: string;
          users: {
            display_name: string | null;
          } | null;
        }) =>
          users
            ? { id: platform_user_id, display_name: users.display_name || '' }
            : null
      )
      .filter((v: WorkspaceUser | null) => v),
  };

  return data as WorkspaceUser;
}
