import { type Horse, type Race } from './types';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Lightbulb, Network, Target, TrendingUp } from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { motion } from 'framer-motion';

interface AlgorithmInsightsProps {
  horses: Horse[];
  races: Race[];
  currentRaceIndex: number;
  fasterThanRelationships: Map<number, Set<number>>;
  slowerThanRelationships: Map<number, Set<number>>;
  finalRanking: number[];
}

export function AlgorithmInsights({
  horses,
  races,
  currentRaceIndex,
  fasterThanRelationships,
  slowerThanRelationships,
  finalRanking,
}: AlgorithmInsightsProps) {
  // Calculate algorithm efficiency metrics
  const totalRelationships = Array.from(
    fasterThanRelationships.values()
  ).reduce((acc, set) => acc + set.size, 0);
  const maxPossibleRelationships = (horses.length * (horses.length - 1)) / 2;
  const relationshipCoverage = totalRelationships / maxPossibleRelationships;

  // Calculate race type distribution
  const raceTypes = {
    preliminary: races.filter((r) => r.raceType === 'preliminary').length,
    championship: races.filter((r) => r.raceType === 'championship').length,
    candidate: races.filter((r) => r.raceType === 'candidate').length,
  };

  // Calculate current phase effectiveness
  const currentRace = races[currentRaceIndex];
  const getPhaseEffectiveness = () => {
    if (!currentRace) return 0;

    const newRelationships = currentRace.result.reduce((acc, _, index) => {
      const laterHorses = currentRace.result.slice(index + 1);
      return acc + laterHorses.length;
    }, 0);

    return (
      newRelationships /
      ((currentRace.horses.length * (currentRace.horses.length - 1)) / 2)
    );
  };

  // Calculate prediction accuracy for next positions
  const calculateNextPositionPredictions = () => {
    const unknownHorses = horses
      .map((h) => h.id)
      .filter(
        (id) => !finalRanking.slice(0, currentRaceIndex + 1).includes(id)
      );

    return unknownHorses
      .map((horseId) => {
        const fasterCount = slowerThanRelationships.get(horseId)?.size || 0;
        const slowerCount = fasterThanRelationships.get(horseId)?.size || 0;
        const score = fasterCount - slowerCount;
        return { horseId, score };
      })
      .sort((a, b) => b.score - a.score);
  };

  const nextPositionPredictions = calculateNextPositionPredictions();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Algorithm Progress Insights */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-medium">Algorithm Progress</h3>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <div className="flex justify-between text-xs">
                <span>Relationship Coverage</span>
                <span>{Math.round(relationshipCoverage * 100)}%</span>
              </div>
              <Progress value={relationshipCoverage * 100} className="mt-1" />
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(raceTypes).map(([type, count]) => (
                <Badge key={type} variant="secondary" className="capitalize">
                  {type}: {count}
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        {/* Current Phase Analysis */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-medium">Current Phase</h3>
          </div>
          {currentRace ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {currentRace.raceType} Race
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {Math.round(getPhaseEffectiveness() * 100)}% Effective
                </span>
              </div>
              <div className="text-muted-foreground text-xs">
                {currentRace.raceDescription}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground mt-3 text-xs">
              No race in progress
            </div>
          )}
        </Card>
      </div>

      {/* Predictive Analysis */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-medium">Position Predictions</h3>
        </div>
        {nextPositionPredictions.length > 0 && (
          <div className="mt-3">
            <div className="text-muted-foreground mb-2 text-xs">
              Top candidates for next positions:
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {nextPositionPredictions
                .slice(0, 6)
                .map(({ horseId, score }, index) => {
                  const horse = horses.find((h) => h.id === horseId);
                  if (!horse) return null;

                  return (
                    <motion.div
                      key={horseId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: horse.color }}
                      >
                        {horse.id}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          Horse #{horse.id}
                        </div>
                        <div className="text-muted-foreground text-[10px]">
                          Confidence Score: {score}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
            </div>
          </div>
        )}
      </Card>

      {/* Relationship Network Stats */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-green-500" />
          <h3 className="text-sm font-medium">Relationship Network</h3>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground mb-1 text-xs">
              Known Relationships
            </div>
            <div className="text-2xl font-bold text-green-500">
              {totalRelationships}
              <span className="text-muted-foreground ml-1 text-xs">
                of {maxPossibleRelationships}
              </span>
            </div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-xs">
              Average Relations per Horse
            </div>
            <div className="text-2xl font-bold text-blue-500">
              {Math.round(totalRelationships / horses.length)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
