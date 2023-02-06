import {
  Avatar,
  Modal,
  Textarea,
  TextInput,
  useMantineTheme,
} from '@mantine/core';
import { ReactElement, useEffect, useState } from 'react';
import InputForm from '../../components/expenses/InputForm';
import Layout from '../../components/layouts/Layout';
import HeaderX from '../../components/metadata/HeaderX';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { DEV_MODE } from '../../constants/common';
import RecurringTab from '../../components/expenses/RecurringTab';
import TrannsactionRow from '../../components/expenses/TransactionRow';

const ExpensesPage: PageWithLayoutProps = () => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  const [modalOpened, setModalOpened] = useState(false);

  useEffect(() => {
    changeLeftSidebarSecondaryPref('hidden');
    setRootSegment({
      content: 'Expenses',
      href: '/expenses',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const theme = useMantineTheme();

  if (!DEV_MODE)
    return (
      <>
        <HeaderX label="Expenses" />
        <div className="p-4 md:h-screen md:p-8">
          <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 p-8 text-center text-2xl font-semibold text-purple-300 md:text-6xl">
            Under construction 🚧
          </div>
        </div>
      </>
    );

  return (
    <>
      <HeaderX label="Expenses" />
      <div className="h-full p-4 md:p-8">
        <div className="flex h-full min-h-full w-full flex-col gap-8">
          <div className="flex h-fit w-full items-center justify-center gap-8 text-xl font-semibold">
            <div className="transition duration-500 hover:cursor-pointer hover:text-blue-700">
              Dashboard
            </div>
            <div className="transition duration-500 hover:cursor-pointer hover:text-blue-700">
              Transaction
            </div>
            <div className="transition duration-500 hover:cursor-pointer hover:text-blue-700">
              Wallet
            </div>
            <div className="transition duration-500 hover:cursor-pointer hover:text-blue-700">
              Report
            </div>
          </div>

          <div className="flex-col justify-between xl:flex xl:flex-row">
            <div>
              <div className="h-fit w-full rounded-lg bg-green-300/30 p-5 text-green-300 hover:cursor-pointer sm:w-1/2 lg:w-[17rem]">
                <div className="text-xl font-semibold">Total balance</div>
                <div className=" text-4xl font-bold">0 VND</div>
              </div>

              <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title="Add Wallet"
                overlayColor={
                  theme.colorScheme === 'dark'
                    ? theme.colors.dark[9]
                    : theme.colors.gray[2]
                }
                overlayOpacity={0.55}
                overlayBlur={3}
              >
                <div className="flex flex-col gap-4">
                  <TextInput placeholder="Initial balance" />
                  <TextInput placeholder="Wallet name" />
                  <Textarea
                    placeholder="Description"
                    autosize
                    minRows={2}
                    maxRows={4}
                  />
                </div>
                <div className="mt-4 text-right">
                  <button className="rounded-md bg-zinc-800 px-3 py-1 hover:bg-blue-300/30 hover:text-blue-300">
                    Save
                  </button>
                </div>
              </Modal>

              <InputForm />

              <div
                onClick={() => setModalOpened(true)}
                className="my-5 rounded-lg bg-zinc-800 p-2 text-center hover:cursor-pointer"
              >
                Create your first wallet
              </div>


            </div>

            <div className="w-full lg:w-[50rem]">
              <div className="flex w-full gap-8 overflow-x-scroll">
                <RecurringTab name="iCloud 50GB" amount={1000} />
                <RecurringTab name="Netflix" amount={1000} />
                {/* <RecurringTab name="Netflix" amount={1000} /> */}
                <RecurringTab name="Dribbble" amount={1000} />
                <RecurringTab name="iCloud 50GB" amount={1000} />
              </div>
              <div className="w-full py-5">
                <div className="text-xl font-semibold">Latest transactions</div>
                <div>
                  You did not have any record. Create a wallet to add
                  transaction.
                </div>
                <div>
                  <TrannsactionRow
                    wallet="Momo"
                    category="Meal"
                    title="Breakfast"
                    time="Today"
                    amount={1000}
                    type="Expense"
                  />
                  <TrannsactionRow
                    wallet="Cake"
                    category="Meal"
                    title="Lunch"
                    time="06/02/2023"
                    amount={100}
                    type="Expense"
                  />
                  <TrannsactionRow
                    wallet="BIDV"
                    category="Salary"
                    title="Salary 1/2023"
                    time="20/01/2023"
                    amount={10000}
                    type="Income"
                  />
                  <TrannsactionRow
                    wallet="Momo"
                    category="Meal"
                    title="Breakfast"
                    time="Today"
                    amount={1000}
                    type="Expense"
                  />
                  <TrannsactionRow
                    wallet="Momo"
                    category="Meal"
                    title="Breakfast"
                    time="Today"
                    amount={1000}
                    type="Expense"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

ExpensesPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default ExpensesPage;
