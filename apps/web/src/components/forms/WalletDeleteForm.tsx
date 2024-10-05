import { Wallet } from '@/types/primitives/Wallet';
import { Button } from '@mantine/core';

interface Props {
  wallet: Wallet;
  onDelete: (wallet: Wallet) => void;
}

export default function WalletDeleteForm({ wallet, onDelete }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        This action cannot be undone. This will permanently delete the{' '}
        <span className="font-bold">{wallet.name}</span> wallet.
      </div>
      <div className="flex gap-2">
        <Button
          fullWidth
          variant="subtle"
          color="red"
          onClick={() => {
            onDelete(wallet);
          }}
          mt="md"
        >
          Delete
        </Button>
        <Button
          fullWidth
          variant="subtle"
          onClick={() => {
            // closeAllModals();
          }}
          mt="md"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
