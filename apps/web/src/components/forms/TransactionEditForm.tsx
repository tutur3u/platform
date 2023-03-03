import { Button, NumberInput, Select, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
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
}

const TransactionEditForm = ({
  projectId,
  walletId,
  onDelete,
  transaction,
  onSubmit,
}: Props) => {
  const [name, setName] = useState(transaction?.name || '');
  const [amount, setAmount] = useState<number | ''>(
    (transaction?.amount && Math.abs(transaction?.amount)) || ''
  );
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

  return (
    <>
      <TextInput
        label="Transaction name"
        placeholder="Enter transaction name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setName(event.currentTarget.value)
        }
        data-autofocus
      />

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
    </>
  );
};

export default TransactionEditForm;
