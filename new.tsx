import { ReactElement, useCallback, useEffect, useState } from 'react';
import HeaderX from './apps/web/src/components/metadata/HeaderX';
import { PageWithLayoutProps } from './apps/web/src/types/PageWithLayoutProps';
import { enforceHasWorkspaces } from './apps/web/src/utils/serverless/enforce-has-workspaces';
import NestedLayout from './apps/web/src/components/layouts/NestedLayout';
import { Divider, NumberInput, Switch, Textarea } from '@mantine/core';
import { openModal } from '@mantine/modals';
import PatientSelector from './apps/web/src/components/selectors/PatientSelector';
import { Product } from './apps/web/src/types/primitives/Product';
import PrescriptionCreateModal from './apps/web/src/components/loaders/prescriptions/PrescriptionCreateModal';
import 'dayjs/locale/vi';
import PrescriptionProductInput from './apps/web/src/components/inputs/PrescriptionProductInput';
import { useLocalStorage } from '@mantine/hooks';
import { useSegments } from './apps/web/src/hooks/useSegments';
import { useWorkspaces } from './apps/web/src/hooks/useWorkspaces';

export const getServerSideProps = enforceHasWorkspaces;

const NewPrescriptionPage: PageWithLayoutProps = () => {
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
              content: 'Đơn thuốc',
              href: `/${ws.id}/healthcare/prescriptions`,
            },
            {
              content: 'Tạo mới',
              href: `/${ws.id}/healthcare/prescriptions/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment]);

  const [patientId, setPatientId] = useState<string>('');
  const [advice, setAdvice] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);

  const allProductsValid = () =>
    products.every(
      (product) =>
        product.id.length > 0 && product?.amount && product?.price !== undefined
    );

  const hasRequiredFields = () => products.length > 0 && allProductsValid();

  const addEmptyProduct = () => {
    setProducts((products) => [
      ...products,
      {
        id: '',
      },
    ]);
  };

  const updateProductId = (index: number, newId: string, id?: string) => {
    if (newId === id) return;

    const [newProductId, newUnitId] = newId.split('::');

    if (
      products.some(
        (product) =>
          product.id === newProductId && (product?.unit_id || '') === newUnitId
      )
    )
      return;

    // If the id is provided, it means that the user is changing the id
    // of an existing product. In this case, we need to find the index of the
    // product with the old id and replace it with the new one.
    if (id) {
      const oldIndex = products.findIndex(
        (product) =>
          product.id === newProductId && (product?.unit_id || '') === newUnitId
      );
      if (oldIndex === -1) return;

      setProducts((products) => {
        const newProducts = [...products];
        newProducts[oldIndex].id = newProductId;
        newProducts[oldIndex].unit_id = newUnitId;
        newProducts[index].amount = 1;
        return newProducts;
      });
    } else {
      setProducts((products) => {
        const newProducts = [...products];
        newProducts[index].id = newProductId;
        newProducts[index].unit_id = newUnitId;
        newProducts[index].amount = 1;
        return newProducts;
      });
    }
  };

  const updateAmount = (id: string, amount: number) => {
    const [productId, unitId] = id.split('::');

    const index = products.findIndex(
      (product) => product.id === productId && product.unit_id === unitId
    );

    if (index === -1) return;

    if (amount <= 0) {
      setProducts((products) => products.filter((_, i) => i !== index));
      return;
    }

    setProducts((products) => {
      const newProducts = [...products];
      newProducts[index].amount = amount;
      return newProducts;
    });
  };

  const getUniqueProductIds = () => {
    const unitIds = new Set<string>();
    products.forEach((price) => unitIds.add(price.id));
    return Array.from(unitIds);
  };

  const removePrice = (index: number) =>
    setProducts((products) => products.filter((_, i) => i !== index));

  const updatePrice = useCallback(
    ({
      productId,
      unitId,
      price,
    }: {
      productId: string;
      unitId: string;
      price: number;
    }) => {
      const index = products.findIndex(
        (product) => product.id === productId && product.unit_id === unitId
      );

      if (index === -1) return;

      setProducts((products) => {
        const newProducts = [...products];
        if (
          newProducts?.[index] != undefined &&
          newProducts[index]?.price == undefined &&
          newProducts[index]?.price != price
        )
          newProducts[index].price = price;
        return newProducts;
      });
    },
    [products]
  );

  const [diff, setDiff] = useState<number>(0);

  const amount = products.reduce(
    (acc, product) => acc + (product?.amount || 0),
    0
  );

  const price = products.reduce(
    (acc, product) => acc + (product?.price || 0) * (product?.amount || 0),
    0
  );

  const [closeOrderAfterCreate, setCloseOrderAfterCreate] = useLocalStorage({
    key: 'healthcare-prescriptions-closeOrderAfterCreate',
    defaultValue: true,
  });

  const showCreateModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Tạo đơn thuốc mới</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <PrescriptionCreateModal
          wsId={ws.id}
          prescription={{
            patient_id: patientId,
            price,
            price_diff: diff,
            completed_at: closeOrderAfterCreate ? 'now()' : undefined,
            advice: advice || '',
            note: note || '',
          }}
          products={products}
        />
      ),
    });
  };

  if (!ws) return null;

  return (
    <>
      <HeaderX label="Đơn thuốc – Khám bệnh" />
      <div className="mt-2 flex min-h-full w-full flex-col pb-8">
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2 xl:gap-x-16">
          <Switch
            label="Đóng đơn sau khi tạo"
            checked={closeOrderAfterCreate}
            onChange={(event) =>
              setCloseOrderAfterCreate(event.currentTarget.checked)
            }
          />
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
        <div className="grid gap-x-8 gap-y-4 xl:grid-cols-4 xl:gap-x-16">
          <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">Thông tin cơ bản</div>
              <Divider className="my-2" variant="dashed" />
            </div>

            <PatientSelector
              patientId={patientId}
              setPatientId={setPatientId}
              className="col-span-full"
              required
            />

            <Divider className="col-span-full my-2" />

            {advice != null ? (
              <Textarea
                label="Lời dặn"
                placeholder="Nhập lời dặn cho đơn thuốc này (nếu có)"
                value={advice}
                onChange={(e) => setAdvice(e.currentTarget.value)}
                className="md:col-span-2"
                minRows={5}
                classNames={{
                  input: 'bg-white/5 border-zinc-300/20 font-semibold',
                }}
              />
            ) : (
              <button
                className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/20 md:col-span-2"
                onClick={() => setAdvice('')}
              >
                + Thêm lời dặn
              </button>
            )}

            {note != null ? (
              <Textarea
                label="Ghi chú"
                placeholder="Nhập ghi chú cho đơn thuốc này (nếu có)"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                className="md:col-span-2"
                minRows={5}
                classNames={{
                  input: 'bg-white/5 border-zinc-300/20 font-semibold',
                }}
              />
            ) : (
              <button
                className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/20 md:col-span-2"
                onClick={() => setNote('')}
              >
                + Thêm ghi chú
              </button>
            )}

            {products?.length > 0 && (
              <div className="col-span-full">
                <Divider className="my-2" />
                <NumberInput
                  label="Số tiền khách cần đưa"
                  placeholder="Nhập số tiền khách cần đưa"
                  value={price + (diff || 0)}
                  onChange={(e) => setDiff((e || 0) - price)}
                  classNames={{
                    input: 'bg-white/5 border-zinc-300/20 font-semibold',
                  }}
                  parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                  formatter={(value) =>
                    !Number.isNaN(parseFloat(value || ''))
                      ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                      : ''
                  }
                />

                {diff != 0 && (
                  <>
                    <button
                      className="mt-2 w-full rounded border border-red-300/10 bg-red-300/10 px-4 py-2 font-semibold text-red-300 transition hover:bg-red-300/20 md:col-span-2"
                      onClick={() => setDiff(0)}
                    >
                      Đặt lại
                    </button>
                    <Divider className="my-2" />
                    <div className="my-2 rounded border border-orange-300/10 bg-orange-300/10 p-2 text-center font-semibold text-orange-300">
                      Khách hàng của bạn sẽ{' '}
                      {diff > 0 ? 'trả thêm' : 'được giảm'}{' '}
                      <span className="text-orange-100 underline decoration-orange-100 underline-offset-4">
                        {Intl.NumberFormat('vi-VN', {
                          style: 'currency',
                          currency: 'VND',
                        }).format(Math.abs(diff))}
                      </span>{' '}
                      cho đơn thuốc này.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="grid h-fit gap-x-4 gap-y-2 xl:col-span-3">
            <div className="col-span-full">
              <div className="text-2xl font-semibold">
                Sản phẩm{' '}
                {products?.length > 0 && (
                  <>
                    (
                    <span className="text-blue-300">
                      {Intl.NumberFormat('vi-VN', {
                        style: 'decimal',
                      }).format(products?.length || 0)}{' '}
                      SP
                    </span>{' '}
                    |{' '}
                    <span className="text-purple-300">
                      x
                      {Intl.NumberFormat('vi-VN', {
                        style: 'decimal',
                      }).format(amount || 0)}
                    </span>{' '}
                    |{' '}
                    <span className="text-green-300">
                      {Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(price)}
                    </span>
                    {diff > 0 ? ' + ' : ' - '}{' '}
                    {diff != null && (
                      <span className="text-red-300">
                        {Intl.NumberFormat('vi-VN', {
                          style: 'currency',
                          currency: 'VND',
                        }).format(Math.abs(diff))}
                      </span>
                    )}
                    {' = '}
                    <span className="text-yellow-300">
                      {Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(
                        products.reduce(
                          (a, b) => a + (b?.amount || 0) * (b?.price || 0),
                          0
                        ) + (diff || 0)
                      )}
                    </span>
                    )
                  </>
                )}
              </div>
              <Divider className="mb-4 mt-2" variant="dashed" />

              <button
                className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
                onClick={addEmptyProduct}
              >
                + Thêm sản phẩm
              </button>
            </div>

            {products.map((p, idx) => (
              <PrescriptionProductInput
                key={p.id + idx}
                wsId={ws.id}
                p={p}
                idx={idx}
                isLast={idx === products.length - 1}
                getUniqueProductIds={getUniqueProductIds}
                removePrice={removePrice}
                updateAmount={updateAmount}
                updatePrice={updatePrice}
                updateProductId={updateProductId}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

NewPrescriptionPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewPrescriptionPage;
