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
          ? 'border-blue-500/20 bg-blue-500/20 text-blue-600 hover:bg-blue-500/10 dark:border-blue-300/20 dark:bg-blue-300/5 dark:text-blue-300 dark:hover:bg-blue-300/10'
          : 'text-foreground/80 border-zinc-500/10 bg-zinc-500/5 hover:bg-zinc-500/10 dark:border-zinc-300/10 dark:bg-zinc-400/5 dark:text-zinc-300/70 dark:hover:bg-zinc-300/5'
      }`}
      onClick={onCheck ? () => onCheck(!checked) : undefined}
      disabled={disabled}
    >
      {label}
    </Button>
  );
};

export default FeatureToggle;
