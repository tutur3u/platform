import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { Divider, FileInput, Select, Switch, Tabs } from '@mantine/core';
import { useSegments } from '../../../hooks/useSegments';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import SettingItemCard from '../../../components/settings/SettingItemCard';
import { Wallet } from '../../../types/primitives/Wallet';
import { Transaction } from '../../../types/primitives/Transaction';
import { TransactionCategory } from '../../../types/primitives/TransactionCategory';
import WalletCard from '../../../components/cards/WalletCard';
import TransactionCard from '../../../components/cards/TransactionCard';
import GeneralItemCard from '../../../components/cards/GeneralItemCard';
import { read } from 'xlsx';
import useTranslation from 'next-translate/useTranslation';
import FinanceImportModal from '../../../components/loaders/finance/FinanceImportModal';
import { openModal } from '@mantine/modals';

export const getServerSideProps = enforceHasWorkspaces;

const WalletImportPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const { t } = useTranslation('finance-import');

  const unnamedWorkspace = t('unnamed-workspace');
  const finance = t('finance-overview:finance');
  const importData = t('import-data');

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
              content: importData,
              href: `/${ws.id}/finance/import`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [ws, setRootSegment, unnamedWorkspace, finance, importData]);

  const supportedApplications = [
    {
      label: 'Money Lover',
      formats: [{ label: 'CSV', value: 'csv' }],
      value: 'money-lover',
    },
    {
      label: 'Money Keeper',
      formats: [{ label: 'Excel', value: 'excel' }],
      value: 'money-keeper',
    },
  ];

  const [application, setApplication] = useState<string | null>();
  const [format, setFormat] = useState<string | null>();
  const [delimiter, setDelimiter] = useState<string>('');
  const [thousandsSeparator, setThousandsSeparator] = useState<string>('');
  const [visualize, setVisualize] = useState(false);
  const [file, setFile] = useState<File | null>();

  const [wallets, setWallets] = useState<Wallet[] | null>();
  const [transactions, setTransactions] = useState<Transaction[] | null>();
  const [categories, setCategories] = useState<TransactionCategory[] | null>();

  useEffect(() => {
    setWallets(null);
    setTransactions(null);
    setCategories(null);
  }, [application, format, delimiter]);

  useEffect(() => {
    if (!file) return;

    const readCSV = () => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!e.target?.result) return;

        const text = e.target.result;
        const lines = text.toString().split('\n');

        // Skip the first line
        lines.shift();

        const wallets: Wallet[] = [];
        const transactions: Transaction[] = [];
        const categories: TransactionCategory[] = [];

        // Add unique wallets
        lines.forEach((line) => {
          const [id, , , amount, currency, , walletName] =
            line.split(delimiter);
          if (!id || amount == null) return;

          const wallet = wallets.find((w) => w.name === walletName);
          if (!wallet) {
            wallets.push({
              id: walletName,
              name: walletName,
              currency,
              balance: 0,
            });
          }
        });

        // Add unique categories
        lines.forEach((line) => {
          const [id, , categoryName, amount] = line.split(delimiter);
          if (!id || amount == null) return;

          const category = categories.find((c) => c.name === categoryName);
          if (!category) {
            categories.push({
              id: categoryName,
              name: categoryName,
              is_expense: amount.startsWith('-'),
            });
          }
        });

        // Add transactions
        lines.forEach((line) => {
          const [id, date, categoryName, amount, , description, walletName] =
            line.split(delimiter);

          if (!id || amount == null) return;

          const category = categories.find((c) => c.name === categoryName);
          const wallet = wallets.find((w) => w.name === walletName);

          if (!category || !wallet) return;

          transactions.push({
            id,
            taken_at: date,
            amount: parseFloat(amount),
            description: description || categoryName,
            category_id: category.id,
            wallet_id: wallet.id,
          });

          // Update wallet balance
          if (wallet && wallet?.balance != null)
            wallet.balance += parseFloat(amount);
        });

        setWallets(wallets);
        setTransactions(transactions);
        setCategories(categories);
      };

      reader.readAsText(file);
    };

    const readExcel = () => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!e.target?.result) return;

        const text = e.target.result;
        const workbook = read(text, { type: 'binary' });

        // Each sheet is a wallet
        // Each row, starting from the 12nd row, is a transaction
        // the data for the columns as follows:
        // A: id, B: date, C: time, D: income amount, E: expense amount, F: balance,
        // G: Parent category, H: Category, I: Payee, J: Event, K: Description

        const wallets: Wallet[] = [];
        const transactions: Transaction[] = [];
        const categories: TransactionCategory[] = [];

        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];

          // Add wallet
          const wallet: Wallet = {
            id: sheetName,
            name: sheetName,
            currency: 'VND',
            balance: 0,
          };
          wallets.push(wallet);

          // Add transactions
          let row = 12;

          while (sheet[`A${row}`]) {
            const id = sheet[`A${row}`].v;
            const date = sheet[`B${row}`].w;
            const income = sheet[`D${row}`]?.w?.trim();
            const expense = sheet[`E${row}`]?.w?.trim();

            const parsedIncome = parseFloat(
              thousandsSeparator
                ? (income || '0').replaceAll(thousandsSeparator, '')
                : income || '0'
            );

            const parsedExpense = parseFloat(
              thousandsSeparator
                ? (expense || '0').replaceAll(thousandsSeparator, '')
                : expense || '0'
            );

            const amount = parsedIncome > 0 ? parsedIncome : parsedExpense * -1;

            const description = sheet[`K${row}`]?.w;
            const parentCategoryName = sheet[`G${row}`]?.w;
            const categoryName = sheet[`H${row}`]?.w;

            if (!id || amount == null) {
              row++;
              continue;
            }

            const category = categories.find((c) => c.name === categoryName);
            const parentCategory = categories.find(
              (c) => c.name === parentCategoryName
            );

            // Add unique categories
            if (!category && categoryName) {
              categories.push({
                id: categoryName,
                name: categoryName,
                is_expense: amount < 0,
              });
            }

            if (!parentCategory && parentCategoryName) {
              categories.push({
                id: parentCategoryName,
                name: parentCategoryName,
                is_expense: amount < 0,
              });
            }

            transactions.push({
              id,
              taken_at: date,
              amount,
              description: description || categoryName || parentCategoryName,
              category_id: categoryName,
              wallet_id: sheetName,
            });

            // Update wallet balance
            if (wallet && wallet?.balance != null) wallet.balance += amount;

            row++;
          }
        });

        setWallets(wallets);
        setTransactions(transactions);
        setCategories(categories);
      };

      reader.readAsBinaryString(file);
    };

    if (format === 'csv') readCSV();
    else if (format === 'excel') readExcel();
  }, [file, format, delimiter, thousandsSeparator]);

  const hasRequiredFields = () =>
    application &&
    format &&
    application?.length > 0 &&
    format?.length > 0 &&
    file &&
    (wallets?.length || 0) > 0 &&
    (transactions?.length || 0) > 0 &&
    (categories?.length || 0) > 0;

  const showLoaderModal = () => {
    if (!ws || !hasRequiredFields()) return;

    if (!wallets || wallets.length === 0) return;
    if (!transactions || transactions.length === 0) return;
    if (!categories || categories.length === 0) return;

    openModal({
      title: <div className="font-semibold">{importData}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <FinanceImportModal
          wsId={ws.id}
          wallets={wallets}
          categories={categories}
          transactions={transactions.map((t) => ({
            ...t,
            taken_at: t?.taken_at
              ? t.taken_at.split('/').reverse().join('-')
              : null,
          }))}
        />
      ),
    });
  };

  const getWalletTransactionsCount = (walletId?: string) =>
    walletId
      ? transactions?.filter((t) => t.wallet_id === walletId)?.length || 0
      : 0;

  if (!ws) return null;

  return (
    <>
      <HeaderX label={`${importData} - ${finance}`} />
      <div className="mt-2 flex min-h-full w-full flex-col pb-20">
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
              {importData}
            </button>
          </div>
        </div>

        <Divider className="my-4" />
        <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">{`${t('basic-info')}`}</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <SettingItemCard
            title={`${t('application')}`}
            description={`${t('application-description')}`}
          >
            <Select
              placeholder={`${t('application-placeholder')}`}
              value={application}
              onChange={(a) => {
                setApplication(a);

                const firstFormat =
                  supportedApplications.find((app) => app.value === a)
                    ?.formats[0] || null;

                setFormat(firstFormat?.value);
                setDelimiter(firstFormat?.value === 'csv' ? ',' : '');
                setFile(null);
              }}
              data={supportedApplications}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={`${t('format')}`}
            description={`${t('format-description')}`}
            disabled={!application}
          >
            <Select
              placeholder={`${t('format-placeholder')}`}
              value={format}
              onChange={(e) => {
                setFormat(e);
                setDelimiter(e === 'csv' ? ',' : '');
                setFile(null);
              }}
              data={
                supportedApplications.find((app) => app.value === application)
                  ?.formats || []
              }
              disabled={!application}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={`${t('delimiter')}`}
            description={`${t('delimiter-description')}`}
            disabled={!application || !format}
          >
            <Select
              placeholder={`${t('delimiter-placeholder')}`}
              value={delimiter}
              onChange={(e) => {
                setDelimiter(e || '');
              }}
              data={
                format === 'csv'
                  ? [
                      { value: ',', label: `${t('comma')} (,)` },
                      { value: ';', label: `${t('semicolon')} (;)` },
                      { value: '|', label: `${t('vertical-bar')} (|)` },
                      { value: '\t', label: `${t('tab')} (\\t)` },
                    ]
                  : [
                      {
                        value: '',
                        label: `${t('auto')}`,
                      },
                    ]
              }
              disabled={!application || !format}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={`${t('file')}`}
            description={`${t('file-description')}`}
            disabled={
              !application || !format || (format === 'csv' && !delimiter)
            }
          >
            <FileInput
              placeholder={`${t('file-placeholder')}`}
              value={file}
              onChange={(f) => setFile(f)}
              accept={format === 'csv' ? '.csv' : '.xlsx'}
              disabled={
                !application || !format || (format === 'csv' && !delimiter)
              }
            />
          </SettingItemCard>

          <SettingItemCard
            title={`${t('thousands-separator')}`}
            description={`${t('thousands-separator-description')}`}
            disabled={!file}
          >
            <Select
              placeholder={`${t('thousands-separator-placeholder')}`}
              value={thousandsSeparator}
              onChange={(e) => {
                setThousandsSeparator(e || '');
              }}
              data={[
                { value: '', label: `${t('none')}` },
                { value: ',', label: `${t('semicolon')} (;)` },
                { value: '.', label: `${t('colon')} (.)` },
              ]}
              disabled={!file}
              required
            />
          </SettingItemCard>

          <SettingItemCard
            title={`${t('data-visualization')}`}
            description={`${t('data-visualization-description')}`}
            disabled={!file}
          >
            <Switch
              checked={visualize}
              onChange={(e) => setVisualize(e.target.checked)}
              label={`${t('visualize')}`}
              disabled={!file}
            />
          </SettingItemCard>
        </div>

        {file && (
          <>
            <Divider className="my-4" />
            <div className="grid h-fit gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SettingItemCard
                title={`${t('finance-tabs:wallets')} (${wallets?.length || 0})`}
                description={
                  file && wallets
                    ? `${t('done-input')} ${wallets.length} ${t(
                        'finance-tabs:wallets'
                      ).toLowerCase()} ${t(
                        'with-total-balance'
                      )} ${Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(
                        wallets.reduce((a, b) => a + (b?.balance || 0), 0)
                      )}`
                    : t('wait-input')
                }
                disabled={!file || !wallets}
              />
              <SettingItemCard
                title={`${t('finance-tabs:transactions')} (${
                  transactions?.length || 0
                })`}
                description={
                  file && transactions
                    ? `${t('done-input')} ${transactions.length} ${t(
                        'finance-tabs:transactions'
                      ).toLowerCase()} ${t(
                        'with-total-balance'
                      )} ${Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(
                        transactions.reduce((a, b) => a + (b?.amount || 0), 0)
                      )}`
                    : t('wait-input')
                }
                disabled={!file || !transactions}
              />
              <SettingItemCard
                title={`${t('finance-tabs:transaction-categories')} (${
                  categories?.length || 0
                })`}
                description={
                  file && categories
                    ? `${t('done-input')} ${categories.length} ${t(
                        'finance-tabs:transaction-categories'
                      ).toLowerCase()}s`
                    : t('wait-input')
                }
                disabled={!file || !categories}
              />
            </div>
          </>
        )}

        {file && visualize && (
          <>
            <Divider className="my-4" />
            <Tabs defaultValue="wallets" color="white">
              <Tabs.List>
                <Tabs.Tab value="wallets">{t('finance-tabs:wallets')}</Tabs.Tab>
                <Tabs.Tab value="transactions">
                  {t('finance-tabs:transactions')}
                </Tabs.Tab>
                <Tabs.Tab value="categories">
                  {t('finance-tabs:transaction-categories')}
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="wallets" pt="lg">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {wallets &&
                    wallets?.map((w, idx) => (
                      <WalletCard
                        key={`wallet-${idx}`}
                        wallet={w}
                        amount={getWalletTransactionsCount(w.id)}
                        disableLink
                        showBalance
                        showAmount
                      />
                    ))}
                </div>
              </Tabs.Panel>

              <Tabs.Panel value="transactions" pt="lg">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {transactions &&
                    transactions?.map((c, idx) => (
                      <TransactionCard
                        key={`transaction-${idx}`}
                        transaction={c}
                        disableLink
                        showAmount
                        showWallet
                      />
                    ))}
                </div>
              </Tabs.Panel>

              <Tabs.Panel value="categories" pt="lg">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {categories &&
                    categories?.map((c, idx) => (
                      <GeneralItemCard key={`category-${idx}`} name={c.name} />
                    ))}
                </div>
              </Tabs.Panel>
            </Tabs>
          </>
        )}
      </div>
    </>
  );
};

WalletImportPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default WalletImportPage;
