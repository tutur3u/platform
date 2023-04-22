import { Select } from '@mantine/core';
import { ProductCategory } from '../../types/primitives/ProductCategory';
import useSWR, { mutate } from 'swr';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useEffect } from 'react';
import { showNotification } from '@mantine/notifications';

interface Props {
  categoryId: string;
  setCategoryId: (categoryId: string) => void;

  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const CategorySelector = ({
  categoryId,
  setCategoryId,

  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const { ws } = useWorkspaces();

  const apiPath = `/api/workspaces/${ws?.id}/inventory/categories`;
  const { data: categories } = useSWR<{
    data: ProductCategory[];
    count: number;
  }>(ws?.id ? apiPath : null);

  const data = [
    ...(categories?.data.map((category) => ({
      label: category.name,
      value: category.id,
    })) || []),
  ];

  useEffect(() => {
    if (!categories) return;

    if (categories.data.length === 1) setCategoryId(categories.data[0].id);
    else if (categoryId && !categories?.data.find((p) => p.id === categoryId))
      setCategoryId('');
  }, [categoryId, categories, setCategoryId]);

  const create = async ({
    category,
  }: {
    wsId: string;
    category: Partial<ProductCategory>;
  }): Promise<ProductCategory | null> => {
    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(category),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: 'Lỗi',
          message: 'Không thể tạo danh mục sản phẩm',
          color: 'red',
        });
        return null;
      }

      return { ...category, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo danh mục sản phẩm',
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label="Danh mục"
      placeholder="Chọn danh mục"
      data={data}
      value={categoryId}
      onChange={setCategoryId}
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
          category: {
            name: query,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(categories?.data || []), item]);
          setCategoryId(item.id);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy danh mục nào"
      searchable={searchable}
      creatable={!!ws?.id && creatable}
      disabled={!categories || disabled}
      required={required}
    />
  );
};

export default CategorySelector;
