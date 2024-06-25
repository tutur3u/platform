import { useSegments } from '@/hooks/useSegments';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Vital } from '@/types/primitives/Vital';
import { Divider, TextInput } from '@mantine/core';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

export default function NewVitalPage() {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, vitalId } = router.query;

  const apiPath =
    wsId && vitalId
      ? `/api/workspaces/${wsId}/healthcare/vitals/${vitalId}`
      : null;

  const { data: vital } = useSWR<Vital>(apiPath);

  useEffect(() => {
    setRootSegment(
      ws && vital
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Khám bệnh', href: `/${ws.id}/healthcare` },
            {
              content: 'Chỉ số',
              href: `/${ws.id}/healthcare/vitals`,
            },
            {
              content: vital?.name || 'Chỉ số mới',
              href: `/${ws.id}/healthcare/vitals/${vital.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, vital, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [unit, setUnit] = useState<string>('');

  useEffect(() => {
    if (!vital) return;
    setName(vital?.name || '');
    setUnit(vital?.unit || '');
  }, [vital]);

  const hasRequiredFields = () => vital && name.length > 0;

  return (
    <div className="mt-2 flex min-h-full w-full flex-col">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end gap-2">
          <button
            className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
              vital ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
            }`}
          >
            Xoá
          </button>

          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            Lưu thay đổi
          </button>
        </div>
      </div>

      <Divider className="my-4" />
      <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
        <div className="col-span-full">
          <div className="text-2xl font-semibold">Thông tin cơ bản</div>
          <Divider className="my-2" variant="dashed" />
        </div>

        <TextInput
          label="Tên chỉ số"
          placeholder='Ví dụ: "Nhiệt độ", "Huyết áp", "Huyết đường", "Cholesterol", "Triglyceride", "Creatinine"'
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
          disabled={!vital}
        />

        <div />

        <TextInput
          label="Đơn vị tính"
          placeholder='Ví dụ: "°C", "mmHg", "mg/dl", "mg", "ml", "mg/kg"'
          value={unit}
          onChange={(e) => setUnit(e.currentTarget.value)}
          disabled={!vital}
        />
      </div>
    </div>
  );
}
