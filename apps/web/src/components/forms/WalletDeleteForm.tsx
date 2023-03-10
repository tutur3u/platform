import { Button, TextInput } from '@mantine/core';
import { closeAllModals } from '@mantine/modals';
import { useState } from 'react';
import { Wallet } from '../../types/primitives/Wallet';

interface Props {
  wallet: Wallet;
  onDelete: (wallet: Wallet) => void;
}

export default function WalletDeleteForm({ wallet, onDelete }: Props) {
  const [name, setName] = useState<string>('');
  const isDisabled = wallet.name !== name;

  return (
    <div className="flex flex-col gap-2">
      <div>
        This action cannot be undone. This will permanently delete the{' '}
        {wallet.name} wallet.
      </div>
      <div>
        Please type <span className="font-bold">{wallet.name}</span> to confirm.
      </div>
      <div className="flex flex-col">
        <TextInput onChange={(e) => setName(e.currentTarget.value)} />
        <Button
          className="border border-red-300/20 bg-red-300/10 p-2 font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20"
          fullWidth
          mt="md"
          disabled={isDisabled}
          onClick={() => {
            onDelete(wallet);
            closeAllModals();
          }}
        >
          Delete this wallet and all of its data
        </Button>
      </div>
    </div>
  );
}
