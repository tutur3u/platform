import { type Horse, type Race } from './types';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  AlertTriangle,
  CheckCircle,
  LineChart,
  Sparkles,
  Workflow,
} from '@tuturuuu/ui/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { motion } from 'framer-motion';
import {
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface AlgorithmDiagnosticsProps {
  horses: Horse[];
  races: Race[];
  finalRanking: number[];
  currentRaceIndex: number;
  numHorses: number;
  raceSize: number;
}

export function AlgorithmDiagnostics({
  // horses,
  races,
  finalRanking,
  currentRaceIndex,
  numHorses,
  raceSize,
}: AlgorithmDiagnosticsProps) {
  // Calculate current state metrics
  const knownPositions = finalRanking.slice(0, currentRaceIndex + 1);
  const remainingHorses = numHorses - knownPositions.length;

  // Calculate race efficiency over time
  const raceEfficiencyData = races
    .slice(0, currentRaceIndex + 1)
    .map((race, index) => {
      const newInformation = race.result.length - 1; // Number of new relationships learned
      const maxInformation =
        (race.horses.length * (race.horses.length - 1)) / 2;
      return {
        race: index + 1,
        efficiency: (newInformation / maxInformation) * 100,
      };
    });

  // Calculate convergence rate
  const convergenceRate =
    knownPositions.length > 0
      ? (knownPositions.length / races.length) * (numHorses / raceSize)
      : 0;

  // Analyze potential bottlenecks
  const bottlenecks = [];

  // Check for suboptimal race sizes
  if (races.some((race) => race.horses.length < raceSize - 1)) {
    bottlenecks.push({
      type: 'warning',
      message: 'Some races are not utilizing full capacity',
      impact: 'medium',
    });
  }

  // Check for slow convergence
  if (convergenceRate < 0.5 && currentRaceIndex > numHorses / 2) {
    bottlenecks.push({
      type: 'warning',
      message: 'Algorithm is converging slower than expected',
      impact: 'high',
    });
  }

  // Generate optimization suggestions
  const optimizations = [];

  if (raceSize < Math.sqrt(numHorses)) {
    optimizations.push({
      suggestion: 'Consider increasing race size for better efficiency',
      impact: 'high',
    });
  }

  if (races.filter((r) => r.raceType === 'candidate').length > numHorses / 2) {
    optimizations.push({
      suggestion:
        'High number of candidate races indicates potential for better preliminary grouping',
      impact: 'medium',
    });
  }

  return (
    <div className="space-y-4">
      {/* Current State Overview */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Workflow className="h-4 w-4 text-blue-500" />
              Algorithm State
            </div>
            <div className="grid gap-2">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  Position Resolution Progress
                </div>
                <Progress
                  value={(knownPositions.length / numHorses) * 100}
                  className="h-2"
                />
                <div className="mt-1 text-xs">
                  {knownPositions.length} of {numHorses} positions determined
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  Race Completion
                </div>
                <Progress
                  value={((currentRaceIndex + 1) / races.length) * 100}
                  className="h-2"
                />
                <div className="mt-1 text-xs">
                  {currentRaceIndex + 1} of {races.length} races completed
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LineChart className="h-4 w-4 text-indigo-500" />
              Performance Metrics
            </div>
            <div className="grid gap-2">
              <div className="rounded-md bg-muted p-2">
                <div className="text-xs text-muted-foreground">
                  Convergence Rate
                </div>
                <div className="text-lg font-bold">
                  {Math.round(convergenceRate * 100)}%
                </div>
              </div>
              <div className="rounded-md bg-muted p-2">
                <div className="text-xs text-muted-foreground">
                  Remaining Horses
                </div>
                <div className="text-lg font-bold">{remainingHorses}</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Efficiency Over Time */}
      <Card className="p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Race Efficiency Over Time
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={raceEfficiencyData}>
                <XAxis dataKey="race" />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: '#fff',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="efficiency"
                  stroke="#3b82f6" // Bright blue color
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#2563eb' }}
                />
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-muted-foreground">
            Shows how efficiently each race contributes to the final ranking
          </div>
        </div>
      </Card>

      {/* Bottlenecks and Optimizations */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Bottlenecks */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Potential Bottlenecks
            </div>
            {bottlenecks.length > 0 ? (
              <div className="space-y-2">
                {bottlenecks.map((bottleneck, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-2 rounded-md border p-2"
                  >
                    <AlertTriangle
                      className={`h-4 w-4 flex-shrink-0 ${
                        bottleneck.impact === 'high'
                          ? 'text-red-500'
                          : 'text-amber-500'
                      }`}
                    />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{bottleneck.message}</div>
                      <div className="text-xs text-muted-foreground">
                        Impact:{' '}
                        <Badge
                          variant={
                            bottleneck.impact === 'high'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {bottleneck.impact}
                        </Badge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/10 p-2 text-sm text-green-500">
                <CheckCircle className="h-4 w-4" />
                No significant bottlenecks detected
              </div>
            )}
          </div>
        </Card>

        {/* Optimization Suggestions */}
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-blue-500" />
              Optimization Suggestions
            </div>
            {optimizations.length > 0 ? (
              <div className="space-y-2">
                {optimizations.map((opt, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="rounded-md border p-2"
                  >
                    <div className="text-sm">{opt.suggestion}</div>
                    <div className="mt-1">
                      <Badge
                        variant={
                          opt.impact === 'high' ? 'default' : 'secondary'
                        }
                      >
                        {opt.impact} impact
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-green-500/20 bg-green-500/10 p-2 text-sm text-green-500">
                <CheckCircle className="h-4 w-4" />
                Algorithm is running optimally
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
