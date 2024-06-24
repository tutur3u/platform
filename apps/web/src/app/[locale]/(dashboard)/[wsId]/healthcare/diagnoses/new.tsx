import { useSegments } from '@/hooks/useSegments';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { Divider, TextInput, Textarea } from '@mantine/core';
import { useEffect, useState } from 'react';

export default function NewDiagnosisPage() {
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
            { content: 'Khám bệnh', href: `/${ws.id}/healthcare` },
            {
              content: 'Chẩn đoán',
              href: `/${ws.id}/healthcare/diagnoses`,
            },
            {
              content: 'Tạo mới',
              href: `/${ws.id}/healthcare/diagnoses/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const hasRequiredFields = () => name.length > 0;

  return (
    <div className="mt-2 flex min-h-full w-full flex-col">
      <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
        <div className="flex items-end justify-end">
          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            Tạo mới
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
          label="Tên chẩn đoán"
          placeholder='Ví dụ: "Bệnh viêm phổi", "Bệnh viêm gan B"...'
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />

        <div />

        <Textarea
          label="Mô tả"
          placeholder="Mô tả về chẩn đoán"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          minRows={5}
        />

        <Textarea
          label="Ghi chú"
          placeholder="Ghi chú về chẩn đoán"
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
          minRows={5}
        />
      </div>
    </div>
  );
}
