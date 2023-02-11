import { Button, NumberInput, Select, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import React, { useState } from 'react';
import { ChangeEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../../types/primitives/Transaction';
import { Wallet } from '../../types/primitives/Wallet';

interface Props {
  transaction?: Transaction;
  onSubmit: (walletId: string, transaction: Transaction) => void;
  onDelete?: () => void;
  wallets: Wallet[];
  isWalletsLoading: boolean;
}

const TransactionEditForm = ({
  transaction,
  onSubmit,
  onDelete,
  wallets,
  isWalletsLoading,
}: Props) => {
  const [walletId, setwalletId] = useState<string | null>(
    transaction?.wallet_id || wallets[0]?.id
  );

  const [name, setName] = useState(transaction?.name || '');
  const [amount, setAmount] = useState<number | undefined>(transaction?.amount);
  const [description, setDescription] = useState(
    transaction?.description || ''
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
            };

            onSubmit(walletId || '', newTransaction);
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
