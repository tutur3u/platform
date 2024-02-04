import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

const TimeBlockContext = createContext({
  selectedTimeBlocks: new Map<string, number[]>(),
  editing: false as boolean,
  selecting: true as boolean,
  startEditing: (_: {
    start: { date: string; timeBlock: number };
    selecting: boolean;
  }) => {},
  endEditing: () => {},
  toggleTimeBlock: (_: { date: string; timeBlock: number }) => {},
  toggleEditing: () => {},
});

const TimeBlockingProvider = ({ children }: { children: ReactNode }) => {
  const [selectedTimeBlocks, setSelectedTimeBlocks] = useState<
    Map<string, number[]>
  >(new Map());

  const [editing, setEditing] = useState(false);
  const [selecting, setSelecting] = useState(true);

  const [start, setStart] = useState<{
    date: string;
    timeBlock: number;
  } | null>(null);

  useEffect(() => {
    console.log('Editing', editing);
  }, [editing]);

  const startEditing = ({
    start,
    selecting,
  }: {
    start: {
      date: string;
      timeBlock: number;
    };
    selecting: boolean;
  }) => {
    if (editing) return;
    setStart(start);
    setSelecting(selecting);
    setEditing(true);
  };

  const endEditing = () => {
    if (!editing) return;
    setStart(null);
    setSelecting(true);
    setEditing(false);
  };

  const selectTimeBlock = ({
    startDate,
    endDate,
    startBlock,
    endBlock,
  }: {
    startDate: string;
    endDate: string;
    startBlock: number;
    endBlock: number;
  }) => {
    const start = dayjs(startDate || endDate);
    const end = dayjs(endDate);

    for (let d = start; d.isSame(end) || d.isBefore(end); d = d.add(1, 'day')) {
      const date = d.format('YYYY-MM-DD');

      for (let block = startBlock; block <= endBlock; block++) {
        if (selectedTimeBlocks.get(date)?.includes(block)) continue;
        console.log('Selecting', date, block);

        setSelectedTimeBlocks((prev) => {
          const selectedTimes = prev.get(date) || [];
          return new Map(prev.set(date, [...selectedTimes, block]));
        });
      }
    }
  };

  const deselectTimeBlock = ({
    startDate,
    endDate,
    startBlock,
    endBlock,
  }: {
    startDate: string;
    endDate: string;
    startBlock: number;
    endBlock: number;
  }) => {
    const start = dayjs(startDate || endDate);
    const end = dayjs(endDate);

    for (let d = start; d.isSame(end) || d.isBefore(end); d = d.add(1, 'day')) {
      const date = d.format('YYYY-MM-DD');

      for (let block = startBlock; block <= endBlock; block++) {
        if (!selectedTimeBlocks.get(date)?.includes(block)) continue;
        console.log('Deselecting', date, block);

        setSelectedTimeBlocks((prev) => {
          const selectedTimes = prev.get(date) || [];
          return new Map(
            prev.set(
              date,
              selectedTimes.filter((i) => i !== block)
            )
          );
        });
      }
    }
  };

  const toggleTimeBlock = ({
    date,
    timeBlock,
  }: {
    date: string;
    timeBlock: number;
  }) => {
    if (!start) return;
    if (selecting)
      selectTimeBlock({
        startDate: start.date,
        endDate: date,
        startBlock: start.timeBlock,
        endBlock: timeBlock,
      });
    else
      deselectTimeBlock({
        startDate: start.date,
        endDate: date,
        startBlock: start.timeBlock,
        endBlock: timeBlock,
      });
  };

  const toggleEditing = () => {
    setEditing(!editing);
  };

  return (
    <TimeBlockContext.Provider
      value={{
        selectedTimeBlocks,
        editing,
        selecting,
        startEditing,
        endEditing,
        toggleTimeBlock,
        toggleEditing,
      }}
    >
      {children}
    </TimeBlockContext.Provider>
  );
};

const useTimeBlocking = () => {
  const context = useContext(TimeBlockContext);

  if (context === undefined)
    throw new Error(
      'useTimeBlocking() must be used within a TimeBlockingProvider.'
    );

  return context;
};

export { TimeBlockingProvider, useTimeBlocking };
