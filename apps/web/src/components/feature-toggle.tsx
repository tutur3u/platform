import { Button } from '@tutur3u/ui/button';
import { Check, X } from 'lucide-react';

interface Props {
  label: string;
  checked?: boolean;
  onCheck?: (checked: boolean) => void;
  disabled?: boolean;
}

const FeatureToggle = ({ label, checked, onCheck, disabled }: Props) => {
  return (
    <Button
      variant={checked ? undefined : 'outline'}
      onClick={onCheck ? () => onCheck(!checked) : undefined}
      disabled={disabled}
      className="flex items-center justify-between gap-2"
    >
      {label}
      {checked ? <Check /> : <X />}
    </Button>
  );
};

export default FeatureToggle;
