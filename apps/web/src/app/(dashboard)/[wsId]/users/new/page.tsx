'use client';

import { useState } from 'react';
import { Divider, Select, TextInput, Textarea } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { DatePickerInput } from '@mantine/dates';
import {
  ShieldCheckIcon,
  IdentificationIcon,
  PhoneIcon,
  EnvelopeIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import 'dayjs/locale/vi';
import moment from 'moment';
import UserGroupSelector from '@/components/selectors/UserGroupSelector';
import { genders } from '@/utils/gender-helper';
import WorkspaceUserCreateModal from '@/components/loaders/users/WorkspaceUserCreateModal';
import { UserGroup } from '@/types/primitives/UserGroup';

interface Props {
  params: {
    wsId: string;
  };
}

export default function NewWorkspaceUserPage({ params: { wsId } }: Props) {
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

  const [groups, setGroups] = useState<UserGroup[]>([]);
  const allGroupsValid = () => groups.every((group) => group.id.length > 0);

  const hasRequiredFields = () => name.length > 0 && allGroupsValid();

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

  const showCreateModal = () => {
    openModal({
      title: <div className="font-semibold">Tạo sản phẩm mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <WorkspaceUserCreateModal
          wsId={wsId}
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
          groups={groups}
        />
      ),
    });
  };

  return (
    <div className="mt-2 flex min-h-full w-full flex-col ">
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
            required
          />
          <Select
            label="Giới tính"
            placeholder="Chọn giới tính"
            value={gender}
            data={genders}
            onChange={(val) => setGender(val || '')}
            required
          />

          <DatePickerInput
            label="Ngày sinh"
            placeholder="Chọn ngày sinh"
            value={birthday}
            onChange={setBirthday}
            locale="vi"
            monthLabelFormat={(date) => moment(date).format('MMMM, YYYY')}
            monthsListFormat="MMMM"
            valueFormat="DD/MM/YYYY"
            classNames={{
              input: 'dark:bg-[#25262b]',
            }}
          />

          <TextInput
            label="Dân tộc"
            placeholder='Ví dụ: "Kinh"'
            value={ethnicity}
            onChange={(e) => setEthnicity(e.currentTarget.value)}
          />

          <TextInput
            label="CMND/CCCD"
            placeholder="Nhập số CMND/CCCD của người dùng"
            value={nationalId}
            onChange={(e) => setNationalId(e.currentTarget.value)}
            className="md:col-span-2"
            icon={<IdentificationIcon className="h-5 w-5" />}
          />

          <TextInput
            label="Người giám hộ"
            placeholder="Nhập tên người giám hộ của người dùng"
            value={guardian}
            onChange={(e) => setGuardian(e.currentTarget.value)}
            className="md:col-span-2"
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
            placeholder="Nhập địa chỉ"
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
                  className="rounded border border-red-300/10 bg-red-300/10 px-1 py-1.5 font-semibold text-red-300 transition hover:bg-red-300/20 md:px-4"
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
  );
}
