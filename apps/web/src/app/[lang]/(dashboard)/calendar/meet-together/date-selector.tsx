
import { Calendar } from '@/components/ui/calendar';

interface DateSelectorProps {
  dates?: Date[];
  setDates?: React.Dispatch<React.SetStateAction<Date[] | undefined>>;
}

export default function DateSelector({ dates, setDates }: DateSelectorProps) {

  return (
    <Calendar
      mode="multiple"
      selected={dates}
      onSelect={setDates}
      className="w-fit rounded-md border"
    />
  );
}
