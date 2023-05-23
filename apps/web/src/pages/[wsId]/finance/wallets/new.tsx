import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import {
  Checkbox,
  Divider,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../components/settings/SettingItemCard';
import WalletCreateModal from '../../../../components/loaders/wallets/WalletCreateModal';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const NewWalletPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('wallets');

  const finance = t('finance');
  const wallet = t('wallet');
  const unnamedWorkspace = t('unnamed-ws');
  const create = t('create');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || unnamedWorkspace,
              href: `/${ws.id}`,
            },
            { content: finance, href: `/${ws.id}/finance` },
            {
              content: wallet,
              href: `/${ws.id}/finance/wallets`,
            },
            {
              content: create,
              href: `/${ws.id}/finance/wallets/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment, finance, wallet, unnamedWorkspace, create]);

  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [balance, setBalance] = useState<number>(0);
  const [currency, setCurrency] = useState<string>('VND');
  const [type, setType] = useState<string>('STANDARD');
  const [reportOptOut, setReportOptOut] = useState<boolean>(false);

  const [statementDate, setStatementDate] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<number>(0);
  const [limit, setLimit] = useState<number | ''>('');

  const hasRequiredFields = () =>
    (name.length > 0 && type === 'STANDARD') ||
    (type === 'CREDIT' &&
      (limit || 0) > 0 &&
      statementDate > 0 &&
      paymentDate > 0);

  const showLoaderModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">{t('create-wallet')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <WalletCreateModal
          wsId={ws.id}
          wallet={{
            name,
            description,
            balance,
            currency,
            type,
            limit: limit === '' ? undefined : limit,
            statement_date: statementDate,
            payment_date: paymentDate,
            report_opt_in: !reportOptOut,
          }}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label={`${wallet} - ${finance}`} />
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
              {t('create')}
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">{t('basic-info')}</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <SettingItemCard
            title={t('wallet-name')}
            description={t('wallet-name-description')}
          >
            <TextInput
              placeholder={t('wallet-name-placeholder')}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={type === 'STANDARD' ? t('balance') : t('available-credit')}
            description={
              type === 'STANDARD'
                ? t('balance-description')
                : t('available-credit-description')
            }
          >
            <NumberInput
              placeholder={t('input-amount')}
              value={balance}
              onChange={(num) => setBalance(Number(num))}
              className="w-full"
              min={0}
              parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
              formatter={(value) =>
                !Number.isNaN(parseFloat(value || ''))
                  ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  : ''
              }
            />

            {type === 'CREDIT' && (limit || 0) - balance != 0 && (
              <div
                className={`mt-2 text-sm ${
                  (limit || 0) - balance > 0 ? 'text-red-300' : 'text-green-300'
                }`}
              >
                {(limit || 0) - balance > 0
                  ? t('loan-message')
                  : t('extra-amount-message')}{' '}
                <span className="font-semibold">
                  {Intl.NumberFormat('vi-VN', {
                    style: 'currency',
                    currency: currency,
                  }).format(Math.abs((limit || 0) - balance))}
                </span>{' '}
                {t('in-this-wallet')}
              </div>
            )}
          </SettingItemCard>

          <SettingItemCard
            title={t('currency')}
            description={t('currency-description')}
          >
            <Select
              placeholder={t('currency-placeholder')}
              value={currency}
              onChange={(e) => setCurrency(e || 'VND')}
              data={[
                {
                  label: 'Việt Nam Đồng (VND)',
                  value: 'VND',
                },
              ]}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={t('description')}
            description={t('description-description')}
          >
            <Textarea
              placeholder={t('description-placeholder')}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              minRows={3}
              maxRows={5}
            />
          </SettingItemCard>

          <SettingItemCard
            title={t('type')}
            description={t('type-description')}
          >
            <div className="grid gap-2">
              <Select
                placeholder={t('type-placeholder')}
                value={type}
                onChange={(e) => {
                  setType(e || 'STANDARD');
                  if (e === 'CREDIT') {
                    setLimit(balance);
                  } else {
                    setLimit('');
                  }
                }}
                data={[
                  {
                    label: t('standard'),
                    value: 'STANDARD',
                  },
                  {
                    label: t('credit'),
                    value: 'CREDIT',
                  },
                ]}
                required
              />

              {type === 'CREDIT' && (
                <>
                  <NumberInput
                    label={t('credit-limit')}
                    placeholder={t('credit-limit-placeholder')}
                    value={limit}
                    onChange={(num) => {
                      setLimit(Number(num));
                      setBalance(Number(num));
                    }}
                    min={0}
                    parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                    formatter={(value) =>
                      !Number.isNaN(parseFloat(value || ''))
                        ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                        : ''
                    }
                  />

                  <div className="flex w-full gap-4">
                    <Select
                      label={t('statement-date')}
                      placeholder={t('statement-date-placeholder')}
                      value={statementDate.toString()}
                      onChange={(e) => setStatementDate(Number(e))}
                      data={Array.from({ length: 28 }, (_, i) => ({
                        label: `${i + 1}`,
                        value: `${i + 1}`,
                      }))}
                      className="w-full"
                    />

                    <Select
                      label={t('payment-due-date')}
                      placeholder={t('payment-due-date-placeholder')}
                      value={paymentDate.toString()}
                      onChange={(e) => setPaymentDate(Number(e))}
                      data={Array.from({ length: 28 }, (_, i) => ({
                        label: `${i + 1}`,
                        value: `${i + 1}`,
                      }))}
                      className="w-full"
                    />
                  </div>
                </>
              )}

              <Divider className="my-1" variant="dashed" />
              <Checkbox
                label={t('report-opt-out')}
                checked={reportOptOut}
                onChange={(e) => setReportOptOut(e.currentTarget.checked)}
              />
            </div>
          </SettingItemCard>

          <SettingItemCard
            title={t('icon')}
            description={t('icon-description')}
            disabled
            comingSoon
          />
        </div>
      </div>
    </>
  );
};

NewWalletPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewWalletPage;
