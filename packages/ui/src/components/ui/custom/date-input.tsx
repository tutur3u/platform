import React, { useEffect, useRef } from 'react';

interface DateInputProps {
  value?: Date;
  // eslint-disable-next-line no-unused-vars
  onChange?: (date: Date) => void;
  // eslint-disable-next-line no-unused-vars
  onSubmit?: (date: Date) => void;
}

interface DateParts {
  day: number;
  month: number;
  year: number;
}

const DateInput: React.FC<DateInputProps> = ({ value, onChange, onSubmit }) => {
  const [date, setDate] = React.useState<DateParts>(() => {
    const d = value ? new Date(value) : new Date();
    return {
      day: d.getDate(),
      month: d.getMonth() + 1, // JavaScript months are 0-indexed
      year: d.getFullYear(),
    };
  });

  const monthRef = useRef<HTMLInputElement | null>(null);
  const dayRef = useRef<HTMLInputElement | null>(null);
  const yearRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const d = value ? new Date(value) : new Date();
    setDate({
      day: d.getDate(),
      month: d.getMonth() + 1,
      year: d.getFullYear(),
    });
  }, [value]);

  const validateDate = (field: keyof DateParts, value: number): boolean => {
    if (
      (field === 'day' && (value < 1 || value > 31)) ||
      (field === 'month' && (value < 1 || value > 12)) ||
      (field === 'year' && (value < 1000 || value > 9999))
    ) {
      return false;
    }

    // Validate the day of the month
    const newDate = { ...date, [field]: value };
    const d = new Date(newDate.year, newDate.month - 1, newDate.day);
    return (
      d.getFullYear() === newDate.year &&
      d.getMonth() + 1 === newDate.month &&
      d.getDate() === newDate.day
    );
  };

  const handleInputChange =
    (field: keyof DateParts) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value.trim()
        ? Number(e.target.value.trim())
        : '';

      const isValid =
        typeof newValue === 'number' && validateDate(field, newValue);

      const newDate = { ...date, [field]: newValue };
      setDate(newDate);

      // Only call onChange when the input is valid and complete
      if (isValid && e.target.value.trim().length > 0) {
        const isComplete =
          (field === 'day' && e.target.value.trim().length === 2) ||
          (field === 'month' && e.target.value.trim().length === 2) ||
          (field === 'year' && e.target.value.trim().length === 4);

        if (isComplete) {
          onChange?.(new Date(newDate.year, newDate.month - 1, newDate.day));
        }
      }
    };

  const initialDate = useRef<DateParts>(date);

  const handleBlur =
    (field: keyof DateParts) =>
    (e: React.FocusEvent<HTMLInputElement>): void => {
      if (!e.target.value) {
        setDate(initialDate.current);
        return;
      }

      const newValue = Number(e.target.value);
      const isValid = validateDate(field, newValue);

      if (!isValid) {
        setDate(initialDate.current);
      } else {
        // If the new value is valid, update the initial value
        initialDate.current = { ...date, [field]: newValue };
      }

      // Focus logic
      if (field === 'day' && e.target.value.trim().length === 2) {
        monthRef.current?.focus();
        monthRef.current?.select();
      } else if (field === 'month' && e.target.value.trim().length === 2) {
        yearRef.current?.focus();
        yearRef.current?.select();
      }
    };

  const handleKeyDown =
    (field: keyof DateParts) => (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow command (or control) combinations
      if (e.metaKey || e.ctrlKey) {
        return;
      }

      // Prevent non-numeric characters, excluding allowed keys
      if (
        !/^[0-9]$/.test(e.key) &&
        ![
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Delete',
          'Tab',
          'Backspace',
          'Enter',
        ].includes(e.key)
      ) {
        e.preventDefault();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        let newDate = { ...date };

        if (field === 'day') {
          if (date[field] === new Date(date.year, date.month, 0).getDate()) {
            newDate = { ...newDate, day: 1, month: (date.month % 12) + 1 };
            if (newDate.month === 1) newDate.year += 1;
          } else {
            newDate.day += 1;
          }
        }

        if (field === 'month') {
          if (date[field] === 12) {
            newDate = { ...newDate, month: 1, year: date.year + 1 };
          } else {
            newDate.month += 1;
          }
        }

        if (field === 'year') {
          newDate.year += 1;
        }

        setDate(newDate);
        onChange?.(new Date(newDate.year, newDate.month - 1, newDate.day));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        let newDate = { ...date };

        if (field === 'day') {
          if (date[field] === 1) {
            newDate.month -= 1;
            if (newDate.month === 0) {
              newDate.month = 12;
              newDate.year -= 1;
            }
            newDate.day = new Date(newDate.year, newDate.month, 0).getDate();
          } else {
            newDate.day -= 1;
          }
        }

        if (field === 'month') {
          if (date[field] === 1) {
            newDate = { ...newDate, month: 12, year: date.year - 1 };
          } else {
            newDate.month -= 1;
          }
        }

        if (field === 'year') {
          newDate.year -= 1;
        }

        setDate(newDate);
        onChange?.(new Date(newDate.year, newDate.month - 1, newDate.day));
      }

      if (e.key === 'ArrowRight') {
        if (
          e.currentTarget.selectionStart === e.currentTarget.value.length ||
          (e.currentTarget.selectionStart === 0 &&
            e.currentTarget.selectionEnd === e.currentTarget.value.length)
        ) {
          e.preventDefault();
          if (field === 'month') yearRef.current?.focus();
          if (field === 'day') monthRef.current?.focus();
        }
      } else if (e.key === 'ArrowLeft') {
        if (
          e.currentTarget.selectionStart === 0 ||
          (e.currentTarget.selectionStart === 0 &&
            e.currentTarget.selectionEnd === e.currentTarget.value.length)
        ) {
          e.preventDefault();
          if (field === 'month') dayRef.current?.focus();
          if (field === 'year') monthRef.current?.focus();
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        dayRef.current?.blur();
        monthRef.current?.blur();
        yearRef.current?.blur();
        onSubmit?.(new Date(date.year, date.month - 1, date.day));
      }
    };

  return (
    <div className="flex items-center rounded-md border px-1 text-sm">
      <input
        type="text"
        ref={dayRef}
        max={31}
        maxLength={2}
        value={date.day.toString()}
        onChange={handleInputChange('day')}
        onKeyDown={handleKeyDown('day')}
        onBlur={handleBlur('day')}
        className="w-7 border-none bg-transparent p-0 text-center outline-none"
        placeholder="D"
        autoFocus={false}
      />
      <span className="-mx-px opacity-20">/</span>
      <input
        type="text"
        ref={monthRef}
        max={12}
        maxLength={2}
        value={date.month.toString()}
        onChange={handleInputChange('month')}
        onKeyDown={handleKeyDown('month')}
        onBlur={handleBlur('month')}
        className="w-6 border-none bg-transparent p-0 text-center outline-none"
        placeholder="M"
        autoFocus={false}
      />
      <span className="-mx-px opacity-20">/</span>
      <input
        type="text"
        ref={yearRef}
        max={9999}
        maxLength={4}
        value={date.year.toString()}
        onChange={handleInputChange('year')}
        onKeyDown={handleKeyDown('year')}
        onBlur={handleBlur('year')}
        className="w-12 border-none bg-transparent p-0 text-center outline-none"
        placeholder="YYYY"
        autoFocus={false}
      />
    </div>
  );
};

DateInput.displayName = 'DateInput';

export { DateInput };
