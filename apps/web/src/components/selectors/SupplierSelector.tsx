import { Select } from '@mantine/core';
import { ProductSupplier } from '@/types/primitives/ProductSupplier';
import useSWR, { mutate } from 'swr';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { showNotification } from '@mantine/notifications';

interface Props {
  supplierId: string;
  setSupplierId: (supplierId: string) => void;

  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const SupplierSelector = ({
  supplierId,
  setSupplierId,

  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/suppliers`;
  const { data: suppliers } = useSWR<ProductSupplier[]>(
    ws?.id ? apiPath : null
  );

  const data = [
    ...(suppliers?.map((supplier) => ({
      label: supplier.name || '',
      value: supplier.id || '',
    })) || []),
  ];

  const create = async ({
    supplier,
  }: {
    wsId: string;
    supplier: Partial<ProductSupplier>;
  }): Promise<ProductSupplier | null> => {
    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(supplier),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: 'Lỗi',
          message: 'Không thể tạo nhà cung cấp',
          color: 'red',
        });
        return null;
      }

      return { ...supplier, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo nhà cung cấp',
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label="Nhà cung cấp"
      placeholder="Chọn nhà cung cấp"
      data={data}
      value={supplierId}
      onChange={setSupplierId}
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
          supplier: {
            name: query,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(suppliers || []), item]);
          setSupplierId(item?.id || '');

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy nhà cung cấp nào"
      disabled={!suppliers || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
    />
  );
};

export default SupplierSelector;
