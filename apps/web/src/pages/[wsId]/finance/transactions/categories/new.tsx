import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import { Divider, Select, TextInput } from '@mantine/core';
import { openModal } from '@mantine/modals';
import { useSegments } from '../../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../../hooks/useWorkspaces';
import SettingItemCard from '../../../../../components/settings/SettingItemCard';
import TransactionCategoryCreateModal from '../../../../../components/loaders/transactions/categories/TransactionCategoryCreateModal';
import { useLocalStorage } from '@mantine/hooks';
import useTranslation from 'next-translate/useTranslation';

export const getServerSideProps = enforceHasWorkspaces;

const NewTransactionCategoryPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('categories');
  const finance = t('finance');
  const category = t('category');
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
              content: category,
              href: `/${ws.id}/finance/transactions/categories`,
            },
            {
              content: create,
              href: `/${ws.id}/finance/transactions/categories/new`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment, finance, category, unnamedWorkspace, create]);

  const [name, setName] = useState<string>('');

  const [isExpense, setIsExpense] = useLocalStorage<boolean>({
    key: 'new-transaction-category-is-expense',
    defaultValue: true,
  });

  const hasRequiredFields = () => name.length > 0;

  const showCreateModal = () => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">{t('create-category')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <TransactionCategoryCreateModal
          wsId={ws.id}
          category={{
            name,
            is_expense: isExpense,
          }}
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label={`${category} - ${finance}`} />
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
            title={t('name')}
            description={t('name-description')}
          >
            <TextInput
              placeholder={t('name-placeholder')}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </SettingItemCard>

          <SettingItemCard
            title={t('type')}
            description={t('type-description')}
          >
            <Select
              placeholder={t('type-placeholder')}
              value={isExpense ? 'expense' : 'income'}
              onChange={(e) => setIsExpense(e === 'expense')}
              data={[
                { label: t('expense'), value: 'expense' },
                { label: t('income'), value: 'income' },
              ]}
            />
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

NewTransactionCategoryPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default NewTransactionCategoryPage;
