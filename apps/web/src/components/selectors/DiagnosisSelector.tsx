import { Select } from '@mantine/core';
import { Diagnosis } from '@/types/primitives/Diagnosis';
import useSWR, { mutate } from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';

interface Props {
  diagnosis: Diagnosis | null;
  setDiagnosis: (diagnosis: Diagnosis | null) => void;

  className?: string;

  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const DiagnosisSelector = ({
  diagnosis,
  setDiagnosis,

  className,

  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/healthcare/diagnoses`;
  const { data: diagnoses } = useSWR<Diagnosis[]>(ws?.id ? apiPath : null);

  const data = [
    ...(diagnoses?.map((diagnosis) => ({
      label: diagnosis.name,
      value: diagnosis.id,
    })) || []),
  ];

  useEffect(() => {
    if (!diagnoses) return;

    if (diagnosis) {
      const found = diagnoses.find((p) => p.id === diagnosis.id);
      if (!found) setDiagnosis(null);
    }
  }, [diagnosis, diagnoses, setDiagnosis]);

  const create = async ({
    diagnosis,
  }: {
    wsId: string;
    diagnosis: Partial<Diagnosis>;
  }): Promise<Diagnosis | null> => {
    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(diagnosis),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: 'Lỗi',
          message: 'Không thể tạo chẩn đoán',
          color: 'red',
        });
        return null;
      }

      return { ...diagnosis, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo chẩn đoán',
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label="Chẩn đoán"
      placeholder="Chọn chẩn đoán"
      data={data}
      value={diagnosis?.id}
      onChange={(id) => {
        setDiagnosis(diagnoses?.find((p) => p.id === id) || null);
      }}
      className={className}
      styles={{
        item: {
          // applies styles to selected item
          '&[data-selected]': {
            '&, &:hover': {
              backgroundColor: '#6b686b',
              color: '#fff',
              fontWeight: 600,
            },
          },

          // applies styles to hovered item
          '&:hover': {
            backgroundColor: '#454345',
            color: '#fff',
          },
        },
      }}
      getCreateLabel={(query) => (
        <div>
          + Tạo <span className="font-semibold">{query}</span>
        </div>
      )}
      onCreate={(query) => {
        if (!ws?.id) return null;

        create({
          wsId: ws.id,
          diagnosis: {
            name: query,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(diagnoses || []), item]);
          setDiagnosis(item);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy chẩn đoán nào"
      disabled={!diagnoses || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
    />
  );
};

export default DiagnosisSelector;
