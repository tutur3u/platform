import { cn } from '@tuturuuu/utils/format';
import { Check } from 'lucide-react';
import { Button } from '../button';

export const PresetButton = ({
  preset,
  label,
  isSelected,
  setPreset,
}: {
  preset: string;
  label: string;
  isSelected: boolean;
  setPreset: (preset: string) => void;
}): React.ReactNode => (
  <Button
    className={cn(isSelected && 'pointer-events-none')}
    variant="ghost"
    onClick={() => {
      setPreset(preset);
    }}
  >
    <span className={cn('pr-2 opacity-0', isSelected && 'opacity-70')}>
      <Check width={18} height={18} />
    </span>
    {label}
  </Button>
);
