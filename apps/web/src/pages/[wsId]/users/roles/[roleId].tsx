import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../components/settings/SettingItemCard';
import UserRoleEditModal from '../../../../components/loaders/users/roles/UserRoleEditModal';
import UserRoleDeleteModal from '../../../../components/loaders/users/roles/UserRoleDeleteModal';
import { useRouter } from 'next/router';
import { UserRole } from '../../../../types/primitives/UserRole';
import useSWR from 'swr';

export const getServerSideProps = enforceHasWorkspaces;

const RoleDetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, roleId } = router.query;

  const apiPath =
    wsId && roleId ? `/api/workspaces/${wsId}/users/roles/${roleId}` : null;

  const { data: role } = useSWR<UserRole>(apiPath);

  useEffect(() => {
    setRootSegment(
      ws && role
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Người dùng', href: `/${ws.id}/users` },
            {
              content: 'Vai trò',
              href: `/${ws.id}/users/roles`,
            },
            {
              content: role?.name || 'Vai trò không tên',
              href: `/${ws.id}/users/roles/${role.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, role, setRootSegment]);

  const [name, setName] = useState<string>('');

  useEffect(() => {
    if (!role) return;
    setName(role?.name || '');
  }, [role]);

  const hasRequiredFields = () => name.length > 0;

  const showEditModal = () => {
    if (!role) return;
    if (typeof roleId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Cập nhật bệnh nhân</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <UserRoleEditModal
          wsId={ws.id}
          role={{
            id: roleId,
            name,
          }}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!role) return;
    if (typeof roleId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Xóa bệnh nhân</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <UserRoleDeleteModal wsId={ws.id} roleId={roleId} />,
    });
  };

  return (
    <>
      <HeaderX label="Nguồn tiền – Tài chính" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                role ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
              }`}
              onClick={role ? showDeleteModal : undefined}
            >
              Xoá
            </button>

            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showEditModal : undefined}
            >
              Lưu thay đổi
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">Thông tin cơ bản</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <SettingItemCard
            title="Tên vai trò"
            description="Tên vai trò sẽ được hiển thị trên bảng điều khiển."
          >
            <TextInput
              placeholder="Nhập tên vai trò"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              required
            />
          </SettingItemCard>
        </div>
      </div>
    </>
  );
};

RoleDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default RoleDetailsPage;
