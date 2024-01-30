import { Calendar } from '@/components/ui/calendar';

interface DateSelectorProps {
  value?: Date[];
  onSelect?: React.Dispatch<React.SetStateAction<Date[] | undefined>>;
}

export default function DateSelector({ value, onSelect }: DateSelectorProps) {
  return (
    <Calendar
      mode="multiple"
      selected={value}
      onSelect={onSelect}
      className="w-fit rounded-md border"
    />
  );
}
