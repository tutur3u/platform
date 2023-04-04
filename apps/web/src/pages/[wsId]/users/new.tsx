import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { Divider, Select, TextInput, Textarea } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { DatePickerInput } from '@mantine/dates';
import {
  ShieldCheckIcon,
  IdentificationIcon,
  PhoneIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/solid';
import PatientCreateModal from '../../../components/loaders/users/WorkspaceUserCreateModal';
import 'dayjs/locale/vi';
import { genders } from '../../../utils/gender-helper';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import moment from 'moment';

export const getServerSideProps = enforceHasWorkspaces;

const NewPatientPage: PageWithLayoutProps = () => {
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
            {
              content: 'Người dùng',
              href: `/${ws.id}/users/list`,
            },
            { content: 'Tạo mới', href: `/${ws.id}/users/new` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

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

  const hasRequiredFields = () => name.length > 0;

  const showCreateModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo sản phẩm mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <PatientCreateModal
          wsId={ws.id}
          user={{
            name,
            gender,
            birthday: birthday?.toISOString(),
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

  return (
    <>
      <HeaderX label="Danh sách – Người dùng" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end">
            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showCreateModal : undefined}
            >
              Tạo mới
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
              label="Tên"
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
              placeholder="Chọn giới tính"
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
              placeholder="Chọn ngày sinh"
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
              onChange={(e) => setEthnicity(e.currentTarget.value)}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
            />

            <TextInput
              label="CMND/CCCD"
              placeholder="Nhập số CMND/CCCD"
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
              placeholder="Nhập tên người giám hộ"
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
              placeholder="Ghi chú về người dùng"
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
              placeholder="Nhập địa chỉ"
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

NewPatientPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewPatientPage;
