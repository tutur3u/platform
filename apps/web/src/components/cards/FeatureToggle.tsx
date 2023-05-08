import { Button } from '@mantine/core';

interface Props {
  label: string;
  checked?: boolean;
  onCheck?: (checked: boolean) => void;
  disabled?: boolean;
}

const FeatureToggle = ({ label, checked, onCheck, disabled }: Props) => {
  return (
    <Button
      className={`flex w-full items-center justify-center rounded border p-2 font-semibold transition ${
        checked
          ? 'border-blue-300/20 bg-blue-300/5 text-blue-300 hover:bg-blue-300/10'
          : 'border-zinc-300/10 bg-zinc-400/5 text-zinc-300/70 hover:bg-zinc-300/5'
      }`}
      onClick={onCheck ? () => onCheck(!checked) : undefined}
      disabled={disabled}
    >
      {label}
    </Button>
  );
};

export default FeatureToggle;
