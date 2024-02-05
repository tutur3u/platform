'use client';

import { useEffect, useState } from 'react';
import { useTimeBlocking } from './time-blocking-provider';
import dayjs from 'dayjs';

export default function Debugger({
  startTime,
  endTime,
}: {
  startTime: number;
  endTime: number;
}) {
  const { editing, selectedTimeBlocks } = useTimeBlocking();
  const [timeblocks, setTimeblocks] = useState<
    { date: string; start_time: string; end_time: string }[]
  >([]);

  useEffect(() => {
    if (editing) return;

    // Helper function to format the time
    const formatTime = ({
      startTime,
      block,
      end,
    }: {
      startTime: number;
      block: number;
      end: boolean;
    }) => {
      const timeblock = block + (end ? 1 : 0);

      const hour = Math.floor(startTime + timeblock / 4);
      const minute = (timeblock * 15) % 60;

      const time = dayjs()
        .set('hour', hour)
        .set('minute', minute % 60)
        .format('HH:mm');

      return time;
    };

    // Helper function to create a time block
    const createTimeBlock = ({
      date,
      startTime,
      startBlock,
      endBlock,
    }: {
      date: string;
      startTime: number;
      startBlock: number;
      endBlock: number;
    }) => {
      return {
        date,
        start_time: formatTime({ startTime, block: startBlock, end: false }),
        end_time: formatTime({ startTime, block: endBlock, end: true }),
      };
    };

    const timeblocks = Array.from(selectedTimeBlocks.entries())
      .filter(([_, blocks]) => blocks.length > 0)
      .map(([date, blocks]) => {
        blocks.sort((a, b) => a - b);

        let mergedBlocks = [];
        let startBlock = blocks[0];

        for (let i = 1; i < blocks.length; i++) {
          if (blocks[i] !== blocks[i - 1] + 1) {
            mergedBlocks.push(
              createTimeBlock({
                date,
                startTime,
                startBlock,
                endBlock: blocks[i - 1],
              })
            );
            startBlock = blocks[i];
          }
        }

        mergedBlocks.push(
          createTimeBlock({
            date,
            startTime,
            startBlock,
            endBlock: blocks[blocks.length - 1],
          })
        );
        return mergedBlocks;
      })
      .flat();

    setTimeblocks(timeblocks);
  }, [startTime, endTime, editing, selectedTimeBlocks]);

  return (
    <div>
      <div className="w-96">{JSON.stringify(timeblocks)}</div>
    </div>
  );
}
