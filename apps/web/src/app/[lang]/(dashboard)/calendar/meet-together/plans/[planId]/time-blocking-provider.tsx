'use client';

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

interface User {
  id: string;
  name?: string;
  passwordHash?: string;
  isGuest?: boolean;
}

const TimeBlockContext = createContext({
  user: null as User | null,
  selectedTimeBlocks: new Map<string, number[]>(),
  editing: false as boolean,
  selecting: true as boolean,
  showLogin: false as boolean,
  setUser: (_: User | null) => {},
  startEditing: (_: {
    start: { date: string; timeBlock: number };
    selecting: boolean;
  }) => {},
  endEditing: () => {},
  toggleTimeBlock: (_: { date: string; timeBlock: number }) => {},
  toggleEditing: () => {},
  setShowLogin: (_: boolean) => {},
});

const TimeBlockingProvider = ({ children }: { children: ReactNode }) => {
  const [selectedTimeBlocks, setSelectedTimeBlocks] = useState<
    Map<string, number[]>
  >(new Map());

  const [editing, setEditing] = useState(false);
  const [selecting, setSelecting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(false);

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
          if (selectedTimes.includes(block)) return prev;
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
          if (!selectedTimes.includes(block)) return prev;
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

  // const formatTime = ({
  //   startTime,
  //   block,
  //   end,
  // }: {
  //   startTime: number;
  //   block: number;
  //   end: boolean;
  // }) => {
  //   const timeblock = block + (end ? 1 : 0);

  //   const hour = Math.floor(startTime + timeblock / 4);
  //   const minute = (timeblock * 15) % 60;

  //   const time = dayjs()
  //     .set('hour', hour)
  //     .set('minute', minute % 60)
  //     .format('HH:mm');

  //   return time;
  // };

  // const createTimeBlock = ({
  //   date,
  //   startTime,
  //   startBlock,
  //   endBlock,
  // }: {
  //   date: string;
  //   startTime: number;
  //   startBlock: number;
  //   endBlock: number;
  // }) => {
  //   return {
  //     date,
  //     start_time: formatTime({ startTime, block: startBlock, end: false }),
  //     end_time: formatTime({ startTime, block: endBlock, end: true }),
  //   };
  // };

  // const syncTimeBlock = async (timeblock: {
  //   date: string;
  //   start_time: string;
  //   end_time: string;
  // }) => {
  // await fetch('/api/timeblock', {
  //   method: 'POST',
  //   body: JSON.stringify(timeblock),
  // });
  // };

  // const syncTimeBlocks = ({ startTime }: { startTime: number }) => {
  //   const timeblocks = Array.from(selectedTimeBlocks.entries())
  //     .filter(([_, blocks]) => blocks.length > 0)
  //     .map(([date, blocks]) => {
  //       blocks.sort((a, b) => a - b);

  //       let mergedBlocks = [];
  //       let startBlock = blocks[0];

  //       for (let i = 1; i < blocks.length; i++) {
  //         if (blocks[i] !== blocks[i - 1] + 1) {
  //           mergedBlocks.push(
  //             createTimeBlock({
  //               date,
  //               startTime,
  //               startBlock,
  //               endBlock: blocks[i - 1],
  //             })
  //           );
  //           startBlock = blocks[i];
  //         }
  //       }

  //       mergedBlocks.push(
  //         createTimeBlock({
  //           date,
  //           startTime,
  //           startBlock,
  //           endBlock: blocks[blocks.length - 1],
  //         })
  //       );
  //       return mergedBlocks;
  //     })
  //     .flat();

  //   // For each time block, asynchonously send the time block to the server
  //   timeblocks.forEach(async (timeblock) => {
  //     console.log('Sending time block', timeblock);
  //     // await syncTimeBlock(timeblock);
  //   });
  // };

  const toggleEditing = () => setEditing((prev) => !prev);

  return (
    <TimeBlockContext.Provider
      value={{
        user,
        selectedTimeBlocks,
        editing,
        selecting,
        showLogin,
        setUser,
        startEditing,
        endEditing,
        toggleTimeBlock,
        toggleEditing,
        setShowLogin,
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
