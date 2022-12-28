import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const CalendarContext = createContext({
  getDate: () => new Date(),
  getDatesInView: () => [new Date()] as Date[],
  getTitle: () => 'Title' as string,

  isToday: () => true as boolean,
  selectToday: () => console.log('selectToday'),
  selectDate: (date: Date) => console.log('selectDate', date),

  handleNext: () => console.log('handleNext'),
  handlePrev: () => console.log('handlePrev'),

  enableDayView: () => console.log('enableDayView'),
  enable4DayView: () => console.log('enable4DayView'),
  enableWeekView: () => console.log('enableWeekView'),
});

export const CalendarProvider = ({ children }: { children: ReactNode }) => {
  const [date, setDate] = useState(new Date());

  const getDate = () => date;

  const getTitle = () =>
    date.toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });

  // Update the date's hour and minute, every minute
  useEffect(() => {
    // calculate seconds to next minute
    const secondsToNextMinute = 60 - new Date().getSeconds();

    // Make sure the date is updated at the start of the next minute
    const timeout = setTimeout(() => {
      setDate((date) => {
        const newDate = new Date(date);

        newDate.setHours(new Date().getHours());
        newDate.setMinutes(new Date().getMinutes());

        return newDate;
      });

      // And then update it every minute
      const interval = setInterval(() => {
        setDate((date) => {
          const newDate = new Date(date);

          newDate.setHours(new Date().getHours());
          newDate.setMinutes(new Date().getMinutes());

          return newDate;
        });
      }, 60000);

      return () => clearInterval(interval);
    }, secondsToNextMinute * 1000);

    return () => clearTimeout(timeout);
  }, []);

  const isToday = () => {
    const today = new Date();
    return date?.toDateString() === today.toDateString();
  };

  const selectDate = (date: Date) => {
    setDate(date);
  };

  const selectToday = () => {
    setDate(new Date());
  };

  const [datesInView, setDatesInView] = useState<Date[]>([]);

  const getDatesInView = () => datesInView;

  const enableDayView = useCallback(() => {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    setDatesInView([newDate]);
  }, [date]);

  const enable4DayView = useCallback(() => {
    const dates = [];

    for (let i = 0; i < 4; i++) {
      const newDate = new Date(date);
      newDate.setHours(0, 0, 0, 0);
      newDate.setDate(newDate.getDate() + i);
      dates.push(newDate);
    }

    setDatesInView(dates);
  }, [date]);

  const enableWeekView = useCallback(() => {
    const getMonday = () => {
      const day = date.getDay() || 7;
      const newDate = new Date(date);
      if (day !== 1) newDate.setHours(-24 * (day - 1));
      return newDate;
    };

    const getWeekdays = () => {
      const monday = getMonday();
      const dates = [];

      for (let i = 0; i < 7; i++) {
        const newDate = new Date(monday);
        newDate.setHours(0, 0, 0, 0);
        newDate.setDate(newDate.getDate() + i);
        dates.push(newDate);
      }
      return dates;
    };

    setDatesInView(getWeekdays());
  }, [date]);

  useEffect(() => {
    const updateDatesInView = () => {
      if (datesInView.length === 1) enableDayView();
      else if (datesInView.length === 4) enable4DayView();
      else if (datesInView.length === 7) enableWeekView();
    };

    updateDatesInView();
  }, [date, datesInView.length, enableDayView, enable4DayView, enableWeekView]);

  const handleNext = () =>
    setDate((date) => {
      const newDate = new Date(date);
      newDate.setDate(newDate.getDate() + datesInView.length);
      return newDate;
    });

  const handlePrev = () =>
    setDate((date) => {
      const newDate = new Date(date);
      newDate.setDate(newDate.getDate() - datesInView.length);
      return newDate;
    });

  // Set the initial view to week view
  useEffect(() => {
    if (datesInView.length === 0) enableWeekView();
  }, [datesInView.length, enableWeekView]);

  const values = {
    getDate,
    getDatesInView,
    getTitle,

    isToday,
    selectToday,
    selectDate,

    handleNext,
    handlePrev,

    enableDayView,
    enable4DayView,
    enableWeekView,
  };

  return (
    <CalendarContext.Provider value={values}>
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = () => {
  const context = useContext(CalendarContext);

  if (context === undefined)
    throw new Error('useCalendar() must be used within a CalendarProvider.');

  return context;
};
