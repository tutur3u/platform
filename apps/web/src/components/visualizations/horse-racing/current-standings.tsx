import { Card } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { motion } from 'framer-motion';
import type { Horse } from './types';

interface CurrentStandingsProps {
  horses: Horse[];
  finalRanking: number[];
  currentRaceIndex: number;
  fasterThanRelationships: Map<number, Set<number>>;
  slowerThanRelationships: Map<number, Set<number>>;
}

export function CurrentStandings({
  horses,
  finalRanking,
  currentRaceIndex,
  fasterThanRelationships,
  slowerThanRelationships,
}: CurrentStandingsProps) {
  // Get the known positions based on the current race index
  const knownPositions = finalRanking.slice(
    0,
    Math.min(currentRaceIndex + 1, finalRanking.length)
  );

  // Get the remaining unknown positions
  const unknownPositions = horses
    .map((h) => h.id)
    .filter((id) => !knownPositions.includes(id));

  // Calculate potential ranges for each unknown horse
  const potentialRanges = new Map<
    number,
    { min: number; max: number; confidence: number }
  >();

  unknownPositions.forEach((horseId) => {
    const fasterHorses = slowerThanRelationships.get(horseId) || new Set();
    const slowerHorses = fasterThanRelationships.get(horseId) || new Set();

    // Calculate minimum position (number of horses definitely faster + 1)
    const minPosition = fasterHorses.size + 1;

    // Calculate maximum position (total horses - number of definitely slower horses)
    const maxPosition = horses.length - slowerHorses.size;

    // Calculate confidence based on how narrow the range is
    const rangeSize = maxPosition - minPosition + 1;
    const confidence = 1 - rangeSize / horses.length;

    potentialRanges.set(horseId, {
      min: minPosition,
      max: maxPosition,
      confidence: confidence,
    });
  });

  // Calculate confidence score for an unknown horse
  const calculateConfidence = (horseId: number): number => {
    const range = potentialRanges.get(horseId);
    return range ? range.confidence : 0;
  };

  return (
    <div className="space-y-4">
      {/* Progress Overview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Overall Progress</span>
          <span className="text-muted-foreground">
            {knownPositions.length} of {horses.length} positions determined
          </span>
        </div>
        <Progress
          value={(knownPositions.length / horses.length) * 100}
          className="h-2"
        />
      </div>

      <div className="relative">
        <div className="flex flex-col space-y-6">
          {/* Known Positions */}
          {knownPositions.length > 0 && (
            <Card className="overflow-hidden">
              <div className="space-y-2 p-4">
                <h4 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <span>Determined Ranking</span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-500 text-xs">
                    {Math.round((knownPositions.length / horses.length) * 100)}%
                    Complete
                  </span>
                </h4>
                <div className="flex flex-wrap gap-3">
                  {knownPositions.map((horseId, position) => {
                    const horse = horses.find((h) => h.id === horseId);
                    if (!horse) return null;

                    return (
                      <motion.div
                        key={horseId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: position * 0.1 }}
                        className="flex flex-col items-center"
                      >
                        <div className="mb-1 font-semibold text-xs">
                          #{position + 1}
                        </div>
                        <div
                          className="group relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-white font-bold text-sm text-white shadow-md transition-transform hover:scale-110 dark:border-gray-800"
                          style={{
                            backgroundColor: horse.color,
                          }}
                        >
                          {horse.id}
                          <div className="-bottom-6 -translate-x-1/2 absolute left-1/2 z-20 whitespace-nowrap rounded border bg-background px-2 py-1 text-xs opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                            Speed: {horse.speed.toFixed(1)}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* Unknown Positions */}
          {unknownPositions.length > 0 && (
            <Card className="overflow-hidden">
              <div className="space-y-2 p-4">
                <h4 className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
                  <span>Undetermined Positions</span>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-semibold text-blue-500 text-xs">
                    {unknownPositions.length} remaining
                  </span>
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {unknownPositions.map((horseId) => {
                    const horse = horses.find((h) => h.id === horseId);
                    if (!horse) return null;

                    const range = potentialRanges.get(horseId);
                    const confidence = calculateConfidence(horseId);

                    return (
                      <motion.div
                        key={horseId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="group relative flex flex-col items-center rounded-lg border bg-background p-2 shadow-sm"
                      >
                        <div className="mb-1 text-xs">
                          Range: #{range?.min}-#{range?.max}
                        </div>
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white font-bold text-sm text-white shadow-sm dark:border-gray-800"
                          style={{ backgroundColor: horse.color }}
                        >
                          {horse.id}
                        </div>
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{
                              width: `${confidence * 100}%`,
                              opacity: 0.5 + confidence * 0.5,
                            }}
                          />
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {Math.round(confidence * 100)}% certain
                        </div>

                        {/* Relationship tooltip */}
                        <div className="-bottom-2 -translate-x-1/2 absolute left-1/2 z-20 w-48 translate-y-full rounded border bg-background px-2 py-1.5 text-xs opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                          <div className="grid grid-cols-2 gap-1">
                            <div>
                              <span className="text-green-500">
                                Faster than:
                              </span>{' '}
                              {fasterThanRelationships.get(horseId)?.size || 0}
                            </div>
                            <div>
                              <span className="text-red-500">Slower than:</span>{' '}
                              {slowerThanRelationships.get(horseId)?.size || 0}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Statistics */}
      {horses.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card className="p-3">
            <div className="font-medium text-muted-foreground text-xs">
              Known Positions
            </div>
            <div className="mt-1 font-bold text-emerald-500 text-xl">
              {knownPositions.length}
            </div>
          </Card>
          <Card className="p-3">
            <div className="font-medium text-muted-foreground text-xs">
              Unknown Positions
            </div>
            <div className="mt-1 font-bold text-blue-500 text-xl">
              {unknownPositions.length}
            </div>
          </Card>
          <Card className="p-3">
            <div className="font-medium text-muted-foreground text-xs">
              Average Confidence
            </div>
            <div className="mt-1 font-bold text-amber-500 text-xl">
              {Math.round(
                (unknownPositions.reduce(
                  (acc, id) => acc + calculateConfidence(id),
                  0
                ) /
                  (unknownPositions.length || 1)) *
                  100
              )}
              %
            </div>
          </Card>
          <Card className="p-3">
            <div className="font-medium text-muted-foreground text-xs">
              Known Relationships
            </div>
            <div className="mt-1 font-bold text-indigo-500 text-xl">
              {Array.from(fasterThanRelationships.values()).reduce(
                (acc, set) => acc + set.size,
                0
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
