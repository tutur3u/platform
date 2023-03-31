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
import { openModal } from '@mantine/modals';
import { DatePickerInput } from '@mantine/dates';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import moment from 'moment';
import { WorkspaceUser } from '../../../../types/primitives/WorkspaceUser';
import WorkspaceUserEditModal from '../../../../components/loaders/users/WorkspaceUserEditModal';
import WorkspaceUserDeleteModal from '../../../../components/loaders/users/WorkspaceUserDeleteModal';
import { getUsersLabel } from '../../../../utils/ws-helper';

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
  const { userId } = router.query;

  const apiPath = `/api/workspaces/${ws?.id}/users/${userId}`;
  const { data: user } = useSWR<WorkspaceUser>(ws && userId ? apiPath : null);

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: getUsersLabel(ws), href: `/${ws.id}/users` },
            {
              content: 'List',
              href: `/${ws.id}/users/list`,
            },
            {
              content: user?.name || 'Bệnh nhân',
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
  const [ethnicity, setEthnicityity] = useState('');

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
      setEthnicityity(user?.ethnicity || '');
      setNationalId(user?.national_id || '');
      setGuardian(user?.guardian || '');
      setNote(user?.note || '');
      setPhone(user?.phone || '');
      setEmail(user?.email || '');
      setAddress(user?.address || '');
    }
  }, [user]);

  const hasData = () => !!user;

  const hasRequiredFields = () => name.length > 0 && hasData();

  const showEditModal = () => {
    if (!user) return;
    if (typeof userId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Cập nhật bệnh nhân</div>,
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
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!user) return;
    if (typeof userId !== 'string') return;
    if (!ws?.id) return;

    openModal({
      title: <div className="font-semibold">Xóa bệnh nhân</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <WorkspaceUserDeleteModal wsId={ws.id} userId={userId} />,
    });
  };

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end gap-2">
            <button
              className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
                user ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
              }`}
              onClick={user ? showDeleteModal : undefined}
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
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2 xl:gap-x-16">
          <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Thông tin cơ bản</div>
              <Divider className="my-2" variant="dashed" />
            </div>

            <TextInput
              label="Tên bệnh nhân"
              placeholder='Ví dụ: "Nguyễn Văn A"'
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              required
            />
            <Select
              label="Giới tính"
              placeholder="Chọn giới tính của bệnh nhân"
              value={gender}
              data={genders}
              onChange={(val) => setGender(val || '')}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              required
            />

            <DatePickerInput
              label="Ngày sinh"
              placeholder="Chọn ngày sinh của bệnh nhân"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              value={birthday}
              onChange={setBirthday}
              locale="vi"
              monthLabelFormat={(date) => moment(date).format('MMMM, YYYY')}
              monthsListFormat="MMMM"
              valueFormat="DD/MM/YYYY"
            />
            <TextInput
              label="Dân tộc"
              placeholder='Ví dụ: "Kinh"'
              value={ethnicity}
              onChange={(e) => setEthnicityity(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
            />

            <TextInput
              label="CMND/CCCD"
              placeholder="Nhập số CMND/CCCD của bệnh nhân"
              value={nationalId}
              onChange={(e) => setNationalId(e.currentTarget.value)}
              className="md:col-span-2"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              icon={<IdentificationIcon className="h-5 w-5" />}
            />

            <TextInput
              label="Người giám hộ"
              placeholder="Nhập tên người giám hộ của bệnh nhân"
              value={guardian}
              onChange={(e) => setGuardian(e.currentTarget.value)}
              className="md:col-span-2"
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              icon={<ShieldCheckIcon className="h-5 w-5" />}
            />

            <div className="hidden xl:col-span-2 xl:block" />

            <Textarea
              label="Ghi chú"
              placeholder="Ghi chú về bệnh nhân"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
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
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              icon={<PhoneIcon className="h-5 w-5" />}
            />

            <TextInput
              label="Email"
              placeholder='Ví dụ: "nguyenvana@gmail.com"'
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
              icon={<EnvelopeIcon className="h-5 w-5" />}
            />

            <div className="hidden xl:col-span-2 xl:block" />

            <Textarea
              label="Địa chỉ"
              placeholder="Nhập địa chỉ của bệnh nhân"
              value={address}
              onChange={(e) => setAddress(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
            />
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
