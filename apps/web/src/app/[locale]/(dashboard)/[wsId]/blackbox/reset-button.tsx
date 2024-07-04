import { Button } from '@repo/ui/components/ui/button';
import { RefreshCcw } from 'lucide-react';

export default function ResetButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={onClick}
      disabled={disabled}
    >
      <RefreshCcw size={24} />
    </Button>
  );
}
