import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../button';

export const YearView: React.FC<{
  locale: string;
  currentDate: Date;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
  // eslint-disable-next-line no-unused-vars
  handleMonthClick: (month: number) => void;
}> = ({ locale, currentDate, setCurrentDate, handleMonthClick }) => {
  const thisYear = currentDate.getFullYear();
  const months = useMemo(
    () =>
      Array.from(
        { length: 12 },
        (_, i) => new Date(currentDate.getFullYear(), i, 1)
      ),
    [currentDate]
  );

  const handlePrev = () =>
    setCurrentDate(
      new Date(currentDate.setFullYear(currentDate.getFullYear() - 1))
    );
  const handleNext = () =>
    setCurrentDate(
      new Date(currentDate.setFullYear(currentDate.getFullYear() + 1))
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-bold text-xl md:text-2xl">
        <div className="flex items-center gap-1">{thisYear}</div>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="secondary" onClick={handlePrev}>
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button size="xs" variant="secondary" onClick={handleNext}>
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {months.map((month, idx) => (
          <button
            key={`month-${idx}`}
            onClick={() => handleMonthClick(month.getMonth())}
            className="flex flex-none cursor-pointer justify-center rounded bg-foreground/5 p-4 font-semibold transition duration-300 hover:bg-foreground/10"
          >
            {month.toLocaleString(locale, { month: 'long' })}
          </button>
        ))}
      </div>
    </div>
  );
};
