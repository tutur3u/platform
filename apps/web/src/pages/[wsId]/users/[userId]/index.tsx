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
} from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import { DatePickerInput } from '@mantine/dates';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import moment from 'moment';
import { WorkspaceUser } from '../../../../types/primitives/WorkspaceUser';
import { UserGroup } from '../../../../types/primitives/UserGroup';
import UserGroupSelector from '../../../../components/selectors/UserGroupSelector';

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

const WorkspaceUserDetailsPage: PageWithLayoutProps = () => {
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
              content: 'Overview',
              href: `/${ws.id}/users/${userId}`,
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

  const getUniqueUnitIds = () => {
    const groupIds = new Set<string>();
    groups.forEach((r) => groupIds.add(r.id));
    return Array.from(groupIds);
  };

  const updateGroup = (index: number, group: UserGroup | null) => {
    setGroups((groups) => {
      const newGroups = [...groups];
      if (!group) newGroups.splice(index, 1);
      else newGroups[index] = group;
      return newGroups;
    });
  };

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
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
              disabled
            />
            <Select
              label="Giới tính"
              placeholder="Chọn giới tính của người dùng"
              value={gender}
              data={genders}
              onChange={(val) => setGender(val || '')}
              required
              disabled
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
              disabled
            />

            {ws?.preset === 'PHARMACY' && (
              <TextInput
                label="Dân tộc"
                placeholder='Ví dụ: "Kinh"'
                value={ethnicity}
                onChange={(e) => setEthnicity(e.currentTarget.value)}
                disabled
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
                disabled
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
                disabled
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
              disabled
            />
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
              disabled
            />

            <TextInput
              label="Email"
              placeholder='Ví dụ: "nguyenvana@gmail.com"'
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              icon={<EnvelopeIcon className="h-5 w-5" />}
              disabled
            />

            <div className="hidden xl:col-span-2 xl:block" />

            <Textarea
              label="Địa chỉ"
              placeholder="Nhập địa chỉ của người dùng"
              value={address}
              onChange={(e) => setAddress(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
              disabled
            />

            {groups.length > 0 && (
              <>
                <Divider className="col-span-full my-2" />
                <div className="col-span-full grid gap-2">
                  <div className="text-2xl font-semibold">Nhóm người dùng</div>
                  <Divider className="mb-2" variant="dashed" />

                  {groups.map((r, idx) => (
                    <div key={`group-${idx}`} className="flex items-end gap-2">
                      <UserGroupSelector
                        group={r}
                        setGroup={(r) => updateGroup(idx, r)}
                        blacklist={getUniqueUnitIds()}
                        className="w-full"
                        hideLabel
                        disabled
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

WorkspaceUserDetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="user_details">{page}</NestedLayout>;
};

export default WorkspaceUserDetailsPage;
