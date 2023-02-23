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
  const [amount, setAmount] = useState<number | undefined>(
    transaction?.amount && Math.abs(transaction?.amount)
  );
  const [description, setDescription] = useState(
    transaction?.description || ''
  );

  const [type, setType] = useState<string | null>(
    transaction?.amount && transaction?.amount < 0 ? 'expense' : 'income'
  );

  return (
    <>
      {transaction?.id && (
        <TextInput
          label="Transaction ID"
          value={transaction?.id}
          className="mb-2"
          disabled
        />
      )}

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
        onChange={setType}
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
            const newTransaction = {
              id: transaction?.id || uuidv4(),
              name,
              amount: amount || 0,
              description,
              type: type || 'expense',
            };

            onSubmit(projectId, walletId || '', newTransaction);
            closeAllModals();
          }}
          mt="md"
          disabled={!name}
        >
          {transaction?.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </>
  );
};

export default TransactionEditForm;
