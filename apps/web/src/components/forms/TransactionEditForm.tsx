import { Button, NumberInput, Select, TextInput } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Category } from '../../types/primitives/Category';
import { Transaction } from '../../types/primitives/Transaction';

interface Props {
  transaction?: Transaction;
  onSubmit: (
    projectId: string,
    walletId: string,
    transaction: Transaction
  ) => void;
  onDelete?: () => void;
  projectId: string;
  walletId: string;
  categories: Category[];
}

const TransactionEditForm = ({
  projectId,
  walletId,
  onDelete,
  transaction,
  onSubmit,
  categories,
}: Props) => {
  const [amount, setAmount] = useState<number | ''>(
    (transaction?.amount && Math.abs(transaction?.amount)) || ''
  );
  const [name, setName] = useState(transaction?.name || '');
  // const [date, setDate] = useState(transaction?.date || new Date());
  const [description, setDescription] = useState(
    transaction?.description || ''
  );

  const [type, setType] = useState<'expense' | 'income'>(
    transaction?.amount !== undefined
      ? transaction.amount < 0
        ? 'expense'
        : 'income'
      : 'expense'
  );

  const [categoryId, setCategoryId] = useState<string | null>(
    transaction?.category_id || null
  );

  return (
    <div className="flex flex-col gap-3">
      <NumberInput
        label="Amount"
        placeholder="Enter amount"
        value={amount}
        onChange={setAmount}
        min={0}
        parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
        formatter={(value) =>
          !Number.isNaN(parseFloat(value || ''))
            ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
            : ''
        }
        data-autofocus
      />

      <TextInput
        label="Transaction name"
        placeholder="Enter transaction name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.currentTarget.value)
        }
      />

      <DateTimePicker
        label="Date and time"
        placeholder="Choose date and time"
        // value={date}
        // onChange={setDate}
        popoverProps={{ withinPortal: true }}
      />

      <Select
        label="Category"
        placeholder="Choose category"
        data={categories.map((category) => ({
          value: category.id,
          label: category.name,
        }))}
        value={categoryId}
        onChange={(value) => setCategoryId(value as string)}
      />

      <Select
        label="Type"
        placeholder="Choose type"
        data={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
        value={type}
        onChange={(value) => setType(value as 'expense' | 'income')}
      />

      <TextInput
        label="Description"
        placeholder="Enter description"
        value={description}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setDescription(event.currentTarget.value)
        }
      />

      <div className="flex gap-2">
        {transaction?.id && onDelete && (
          <Button
            fullWidth
            variant="subtle"
            color="red"
            onClick={() => {
              onDelete();
              closeAllModals();
            }}
            mt="md"
          >
            Delete
          </Button>
        )}
        <Button
          fullWidth
          variant="subtle"
          onClick={() => {
            const newTransaction: Transaction = {
              id: transaction?.id || uuidv4(),
              name,
              amount: type === 'expense' ? (amount || 0) * -1 : amount || 0,
              description,
              // date,
            };

            onSubmit(projectId, walletId || '', newTransaction);
            closeAllModals();
          }}
          mt="md"
          disabled={!amount}
        >
          {transaction?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </div>
  );
};

export default TransactionEditForm;
