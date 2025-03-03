import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Horse {
  id: number;
  speed: number;
  color: string;
}

interface RaceAnimationProps {
  horses: Horse[];
  raceHorses: number[];
  onRaceComplete: (results: number[]) => void;
  animationSpeed: number;
  showSpeeds: boolean;
}

export function RaceAnimation({
  horses,
  raceHorses,
  onRaceComplete,
  animationSpeed,
  showSpeeds,
}: RaceAnimationProps) {
  const [raceCompleted, setRaceCompleted] = useState(false);
  const [, setRaceResults] = useState<number[]>([]);

  // Prepare race data
  useEffect(() => {
    // Extract the horses that will race
    const racingHorses = raceHorses
      .map((id) => horses.find((horse) => horse.id === id)!)
      .filter(Boolean);

    // Sort by speed (fastest first - lower speed value is faster)
    const sortedResults = [...racingHorses]
      .sort((a, b) => a.speed - b.speed)
      .map((horse) => horse.id);

    setRaceResults(sortedResults);
    setRaceCompleted(false);

    // Simulate race completion after animation
    const timer = setTimeout(() => {
      setRaceCompleted(true);
      onRaceComplete(sortedResults);
    }, animationSpeed * 1.2);

    return () => clearTimeout(timer);
  }, [horses, raceHorses, onRaceComplete, animationSpeed]);

  // Calculate finish times based on speeds
  const getFinishTime = (horseId: number) => {
    const horse = horses.find((h) => h.id === horseId);
    if (!horse) return 1;

    // Normalize speeds for animation purposes
    // Faster horses (lower speed values) will have shorter animation durations
    return Math.max(0.5, Math.min(1, horse.speed / 10)) * animationSpeed;
  };

  return (
    <div className="mt-2 mb-4 rounded-lg border bg-gradient-to-r from-green-50 to-blue-50 p-4 dark:from-green-950/30 dark:to-blue-950/30">
      <div className="mb-2 text-sm font-medium">Race Animation</div>

      {/* Race track */}
      <div className="relative h-[240px] w-full overflow-hidden rounded-lg bg-neutral-800 dark:bg-black/70">
        {/* Starting line */}
        <div className="absolute top-0 bottom-0 left-[10%] z-10 w-[2px] bg-white/30"></div>

        {/* Finish line */}
        <div className="absolute top-0 right-[5%] bottom-0 z-10 flex w-[10px] flex-col bg-white/80">
          <div className="flex-1 bg-black/50"></div>
          <div className="flex-1 bg-transparent"></div>
          <div className="flex-1 bg-black/50"></div>
          <div className="flex-1 bg-transparent"></div>
          <div className="flex-1 bg-black/50"></div>
          <div className="flex-1 bg-transparent"></div>
        </div>

        {/* Track lanes */}
        {raceHorses.map((horseId, index) => {
          const horse = horses.find((h) => h.id === horseId);
          const laneHeight = 240 / raceHorses.length;
          const yPosition = index * laneHeight;

          if (!horse) return null;

          return (
            <div
              key={horseId}
              className="absolute right-0 left-0 border-t border-white/10"
              style={{
                top: `${yPosition}px`,
                height: `${laneHeight}px`,
              }}
            >
              {/* Lane number */}
              <div className="absolute top-[50%] left-[2%] flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-xs text-white">
                {index + 1}
              </div>

              {/* Horse */}
              <motion.div
                className="absolute top-[50%] flex -translate-y-1/2 items-center gap-1"
                initial={{ left: '10%' }}
                animate={{
                  left: raceCompleted ? '95%' : ['10%', '95%'],
                }}
                transition={{
                  duration: getFinishTime(horseId) / 1000,
                  ease: 'easeOut',
                  times: [0, 1],
                }}
              >
                {/* Horse circle */}
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: horse.color }}
                >
                  {horseId}
                </div>

                {/* Speed indicator (optional) */}
                {showSpeeds && (
                  <div className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    {horse.speed.toFixed(1)}
                  </div>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* Results preview */}
      {/* {raceCompleted && (
        <div className="mt-2 flex flex-col items-center text-xs">
          <div className="font-medium">Results:</div>
          <div className="mt-1 flex items-center gap-1">
            {raceResults.map((horseId, index) => (
              <React.Fragment key={horseId}>
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{
                    backgroundColor: horses.find((h) => h.id === horseId)
                      ?.color,
                  }}
                >
                  {horseId}
                </span>
                {index < raceResults.length - 1 && (
                  <span className="text-muted-foreground">→</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )} */}
    </div>
  );
}
