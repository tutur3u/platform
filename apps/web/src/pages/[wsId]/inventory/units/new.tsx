import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Checkbox, Divider, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import UnitCreateModal from '../../../../components/loaders/units/UnitCreateModal';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { useSegments } from '../../../../hooks/useSegments';
import UnitItemTab from '../../../../components/inventory/UnitItemTab';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

type UnitType = {
  type: 'quantity' | 'non-quantity' | 'unChecked';
};

const NewUnitPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();
  const { t } = useTranslation('inventory-units-configs');

  const unitSettingText = t('unit-setting');
  const unitNameText = t('unit-name');
  const unitTypeSettingText = t('unit-type-setting');
  const quantityUnitText = t('quantity-unit');
  const nonQuantityUnitText = t('non-quantity-unit');
  const unitNamePLaceholderText = t('unit-name-placeholder');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: 'Kho hàng', href: `/${ws.id}/inventory` },
            {
              content: 'Đơn vị tính',
              href: `/${ws.id}/inventory/units`,
            },
            { content: 'Tạo mới', href: `/${ws.id}/inventory/units/new` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [name, setName] = useState<string>('');
  const [unitType, setUnitType] = useState<UnitType>({
    type: 'unChecked',
  });

  const QuantityUnitState = ({ type }: UnitType) => {
    if (type === 'quantity') {
      return (
        <>
          <Checkbox
            label={quantityUnitText}
            color="grape"
            defaultChecked
            onChange={() =>
              setUnitType({
                type: 'unChecked',
              })
            }
          />
          <Checkbox label={nonQuantityUnitText} color="grape" disabled indeterminate />
        </>
      );
    }
    if (type === 'non-quantity') {
      return (
        <>
          <Checkbox label={quantityUnitText} color="grape" disabled indeterminate />
          <Checkbox
            label={nonQuantityUnitText}
            color="grape"
            defaultChecked
            onChange={() =>
              setUnitType({
                type: 'unChecked',
              })
            }
          />
        </>
      );
    }
    if (type === 'unChecked') {
      return (
        <>
          <Checkbox
            label={quantityUnitText}
            color="grape"
            onChange={() => {
              setUnitType({
                type: 'quantity',
              });
            }}
          />
          <Checkbox
            label={nonQuantityUnitText}
            color="grape"
            onChange={() => {
              setUnitType({
                type: 'non-quantity',
              });
            }}
          />
        </>
      );
    }
  };

  const hasRequiredFields = () => name.length > 0;

  const showLoaderModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo đơn vị tính mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: <UnitCreateModal wsId={ws.id} unit={{ name }} />,
    });
  };

  return (
    <>
      <HeaderX label="Sản phẩm – Kho hàng" />
      <div className="mt-2 flex min-h-full w-full flex-col ">
        <div className="grid gap-x-8 gap-y-4 xl:gap-x-16">
          <div className="flex items-end justify-end">
            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showLoaderModal : undefined}
            >
              Tạo mới
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-x-4 gap-y-2 md:w-1/2">
          <UnitItemTab title={unitSettingText} description={unitNameText}>
            <TextInput
              placeholder={unitNamePLaceholderText}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />
          </UnitItemTab>

          <UnitItemTab description={unitTypeSettingText}>
            <div className="flex flex-col gap-3">
              <QuantityUnitState type={unitType.type} />
            </div>
          </UnitItemTab>
        </div>
      </div>
    </>
  );
};

NewUnitPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewUnitPage;
