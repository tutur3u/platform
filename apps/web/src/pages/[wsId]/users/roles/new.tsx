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
import UserRoleCreateModal from '../../../../components/loaders/users/roles/UserRoleCreateModal';

export const getServerSideProps = enforceHasWorkspaces;

const NewRolePage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
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
              content: 'Tạo mới',
              href: `/${ws.id}/users/roles/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');

  const hasRequiredFields = () => name.length > 0;

  const showLoaderModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo vai trò mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <UserRoleCreateModal
          wsId={ws.id}
          role={{
            name,
          }}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label="Nguồn tiền – Tài chính" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end">
            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showLoaderModal : undefined}
            >
              Tạo mới
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
              required
            />
          </SettingItemCard>
        </div>
      </div>
    </>
  );
};

NewRolePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewRolePage;
