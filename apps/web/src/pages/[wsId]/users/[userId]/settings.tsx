import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import useSWR from 'swr';
import { Divider, Select, TextInput, Textarea } from '@mantine/core';
import {
  EnvelopeIcon,
  IdentificationIcon,
  PhoneIcon,
  ShieldCheckIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import { openModal } from '@mantine/modals';
import { DatePickerInput } from '@mantine/dates';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import moment from 'moment';
import { WorkspaceUser } from '../../../../types/primitives/WorkspaceUser';
import WorkspaceUserEditModal from '../../../../components/loaders/users/WorkspaceUserEditModal';
import WorkspaceUserDeleteModal from '../../../../components/loaders/users/WorkspaceUserDeleteModal';
import { UserGroup } from '../../../../types/primitives/UserGroup';
import UserGroupSelector from '../../../../components/selectors/UserGroupSelector';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const genders = [
  {
    label: 'Nam',
    value: 'MALE',
  },
  {
    label: 'Nữ',
    value: 'FEMALE',
  },
  {
    label: 'Khác',
    value: 'OTHER',
  },
];

const WorkspaceUserSettingsPage: PageWithLayoutProps = () => {
  const { t } = useTranslation();

  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, userId } = router.query;

  const apiPath =
    wsId && userId ? `/api/workspaces/${wsId}/users/${userId}` : null;

  const groupsApiPath =
    wsId && userId ? `/api/workspaces/${wsId}/users/${userId}/groups` : null;

  const { data: user } = useSWR<WorkspaceUser>(apiPath);
  const { data: userGroups } = useSWR<UserGroup[]>(groupsApiPath);

  useEffect(() => {
    setRootSegment(
      ws && user
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Người dùng', href: `/${ws.id}/users/list` },
            {
              content: user?.name || 'Người dùng không tên',
              href: `/${ws.id}/users/${userId}`,
            },
            {
              content: 'Settings',
              href: `/${ws.id}/users/${userId}/settings`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, user, userId, setRootSegment]);

  const [name, setName] = useState('');
  const [gender, setGender] = useState('');

  const [birthday, setBirthday] = useState<Date | null>(null);
  const [ethnicity, setEthnicity] = useState('');

  const [nationalId, setNationalId] = useState('');
  const [guardian, setGuardian] = useState('');

  const [note, setNote] = useState('');

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (user) {
      setName(user?.name || '');
      setGender(user?.gender || '');
      setBirthday(user?.birthday ? moment(user?.birthday).toDate() : null);
      setEthnicity(user?.ethnicity || '');
      setNationalId(user?.national_id || '');
      setGuardian(user?.guardian || '');
      setNote(user?.note || '');
      setPhone(user?.phone || '');
      setEmail(user?.email || '');
      setAddress(user?.address || '');
    }
  }, [user]);

  const [groups, setGroups] = useState<UserGroup[]>([]);

  useEffect(() => {
    if (userGroups) setGroups(userGroups);
  }, [userGroups]);

  const allGroupsValid = () => groups.every((group) => group.id.length > 0);

  const hasData = () => !!user;
  const hasRequiredFields = () =>
    name.length > 0 && allGroupsValid() && hasData();

  const getUniqueUnitIds = () => {
    const groupIds = new Set<string>();
    groups.forEach((r) => groupIds.add(r.id));
    return Array.from(groupIds);
  };

  const addEmptyGroup = () => {
    setGroups((groups) => [
      ...groups,
      {
        id: '',
      },
    ]);
  };

  const updateGroup = (index: number, group: UserGroup | null) => {
    setGroups((groups) => {
      const newGroups = [...groups];
      if (!group) newGroups.splice(index, 1);
      else newGroups[index] = group;
      return newGroups;
    });
  };

  const removeGroup = (index: number) =>
    setGroups((groups) => groups.filter((_, i) => i !== index));

  const showEditModal = () => {
    if (!user || !userGroups) return;
    if (typeof userId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Cập nhật người dùng</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <WorkspaceUserEditModal
          wsId={ws.id}
          user={{
            id: userId,
            name,
            gender,
            birthday: birthday
              ? moment(birthday).format('YYYY-MM-DD')
              : undefined,
            ethnicity,
            national_id: nationalId,
            guardian,
            note,
            phone,
            email,
            address,
          }}
          oldGroups={userGroups}
          groups={groups}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!user) return;
    if (typeof userId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Xóa người dùng</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <WorkspaceUserDeleteModal
          wsId={ws.id}
          userId={userId}
          groups={groups}
        />
      ),
    });
  };

  const reset = () => {
    if (!user) return;
    if (typeof userId !== 'string') return;
    if (!ws?.id) return;

    setName(user?.name || '');
    setGender(user?.gender || '');
    setBirthday(user?.birthday ? moment(user?.birthday).toDate() : null);
    setEthnicity(user?.ethnicity || '');
    setNationalId(user?.national_id || '');
    setGuardian(user?.guardian || '');
    setNote(user?.note || '');
    setPhone(user?.phone || '');
    setEmail(user?.email || '');
    setAddress(user?.address || '');
    setGroups(userGroups || []);
  };

  const isDirty = () => {
    if (!user) return false;
    if (typeof userId !== 'string') return false;
    if (!ws?.id) return false;

    if (
      user?.birthday
        ? !moment(user.birthday).isSame(moment(birthday))
        : !!birthday
    )
      return true;

    if (name !== user.name) return true;
    if (gender !== user.gender) return true;
    if (ethnicity !== user.ethnicity) return true;
    if (nationalId !== user.national_id) return true;
    if (guardian !== user.guardian) return true;
    if (note !== user.note) return true;
    if (phone !== user.phone) return true;
    if (email !== user.email) return true;
    if (address !== user.address) return true;
    if ((groups?.length || 0) !== (userGroups?.length || 0)) return true;

    if (
      groups &&
      userGroups &&
      groups.some((group, i) => group.id !== userGroups[i].id)
    )
      return true;

    return false;
  };

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
        {user && hasRequiredFields() && (
          <div
            className={`absolute inset-x-0 bottom-0 z-[100] mx-4 mb-[4.5rem] flex flex-col items-center justify-between gap-y-4 rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 backdrop-blur transition duration-300 dark:border-zinc-300/10 dark:bg-zinc-900/80 md:mx-8 md:mb-4 md:flex-row lg:mx-16 xl:mx-32 ${
              isDirty() ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div>{t('common:unsaved-changes')}</div>

            <div className="flex w-full items-center gap-4 md:w-fit">
              <button
                className={`w-full font-semibold text-zinc-700 transition dark:text-zinc-300 md:w-fit ${
                  isDirty()
                    ? ''
                    : 'pointer-events-none cursor-not-allowed opacity-50'
                }`}
                onClick={reset}
              >
                {t('common:reset')}
              </button>

              <button
                className={`w-full rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 md:w-fit ${
                  isDirty()
                    ? 'hover:bg-blue-300/20'
                    : 'pointer-events-none cursor-not-allowed opacity-50'
                }`}
                onClick={showEditModal}
              >
                {t('common:save')}
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2 xl:gap-x-16">
          <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Thông tin cơ bản</div>
              <Divider className="my-2" variant="dashed" />
            </div>

            <TextInput
              label="Tên người dùng"
              placeholder='Ví dụ: "Nguyễn Văn A"'
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />
            <Select
              label="Giới tính"
              placeholder="Chọn giới tính của người dùng"
              value={gender}
              data={genders}
              onChange={(val) => setGender(val || '')}
              required
            />

            <DatePickerInput
              label="Ngày sinh"
              placeholder="Chọn ngày sinh của người dùng"
              value={birthday}
              onChange={setBirthday}
              locale="vi"
              monthLabelFormat={(date) => moment(date).format('MMMM, YYYY')}
              monthsListFormat="MMMM"
              valueFormat="DD/MM/YYYY"
              className={ws?.preset !== 'PHARMACY' ? 'md:col-span-2' : ''}
              classNames={{
                input: 'dark:bg-[#25262b]',
              }}
            />

            {ws?.preset === 'PHARMACY' && (
              <TextInput
                label="Dân tộc"
                placeholder='Ví dụ: "Kinh"'
                value={ethnicity}
                onChange={(e) => setEthnicity(e.currentTarget.value)}
              />
            )}

            {ws?.preset === 'PHARMACY' && (
              <TextInput
                label="CMND/CCCD"
                placeholder="Nhập số CMND/CCCD của người dùng"
                value={nationalId}
                onChange={(e) => setNationalId(e.currentTarget.value)}
                className="md:col-span-2"
                icon={<IdentificationIcon className="h-5 w-5" />}
              />
            )}

            {ws?.preset === 'PHARMACY' && (
              <TextInput
                label="Người giám hộ"
                placeholder="Nhập tên người giám hộ của người dùng"
                value={guardian}
                onChange={(e) => setGuardian(e.currentTarget.value)}
                className="md:col-span-2"
                icon={<ShieldCheckIcon className="h-5 w-5" />}
              />
            )}

            <div className="hidden xl:col-span-2 xl:block" />

            <Textarea
              label="Ghi chú"
              placeholder="Ghi chú về người dùng"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
            />

            <Divider className="col-span-full my-2" />
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Bảo mật</div>
              <Divider className="my-2" variant="dashed" />
            </div>
            <div
              onClick={showDeleteModal}
              className="flex cursor-pointer items-center justify-center rounded border border-red-500/20 bg-red-500/10 p-2 font-semibold text-red-600 transition duration-300 hover:border-red-500/30 hover:bg-red-500/20 dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300 dark:hover:border-red-300/30 dark:hover:bg-red-300/20"
            >
              {t('common:delete')}
            </div>
          </div>

          <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Thông tin liên hệ</div>
              <Divider className="my-2" variant="dashed" />
            </div>

            <TextInput
              label="Số điện thoại"
              placeholder='Ví dụ: "0987654321"'
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              icon={<PhoneIcon className="h-5 w-5" />}
            />

            <TextInput
              label="Email"
              placeholder='Ví dụ: "nguyenvana@gmail.com"'
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              icon={<EnvelopeIcon className="h-5 w-5" />}
            />

            <div className="hidden xl:col-span-2 xl:block" />

            <Textarea
              label="Địa chỉ"
              placeholder="Nhập địa chỉ của người dùng"
              value={address}
              onChange={(e) => setAddress(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
            />

            <Divider className="col-span-full my-2" />

            <div className="col-span-full grid gap-2">
              <div className="text-2xl font-semibold">Nhóm người dùng</div>
              <Divider className="mb-2" variant="dashed" />

              <button
                className="w-fit rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
                onClick={addEmptyGroup}
              >
                + Thêm nhóm
              </button>

              {groups.map((r, idx) => (
                <div key={`group-${idx}`} className="flex items-end gap-2">
                  <UserGroupSelector
                    group={r}
                    setGroup={(r) => updateGroup(idx, r)}
                    blacklist={getUniqueUnitIds()}
                    className="w-full"
                  />
                  <button
                    className="rounded border border-red-500/10 bg-red-500/10 px-1 py-1.5 font-semibold text-red-600 transition hover:bg-red-500/20 dark:border-red-300/10 dark:bg-red-300/10 dark:text-red-300 dark:hover:bg-red-300/20 md:px-4"
                    onClick={() => removeGroup(idx)}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

WorkspaceUserSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="user_details">{page}</NestedLayout>;
};

export default WorkspaceUserSettingsPage;
