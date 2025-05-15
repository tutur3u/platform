import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';

interface Horse {
  id: number;
  speed: number;
  color: string;
}

interface HorseDetailsProps {
  horses: Horse[];
  finalRanking: number[];
  currentRaceIndex: number;
  totalRaces: number;
}

export function HorseDetails({
  horses,
  finalRanking,
  currentRaceIndex,
  //   totalRaces,
}: HorseDetailsProps) {
  // Determine what horses have been ranked so far
  const rankedCount = Math.min(
    currentRaceIndex + 1 >= 0 ? finalRanking.length : 0,
    horses.length
  );

  // Create a map of ranking positions
  const rankMap = new Map<number, number>();
  finalRanking.slice(0, rankedCount).forEach((horseId, index) => {
    rankMap.set(horseId, index + 1);
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>Horse Details</span>
          {rankedCount > 0 && (
            <Badge variant="outline" className="text-xs font-normal">
              {rankedCount} of {horses.length} ranked
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">ID</TableHead>
                <TableHead>Horse</TableHead>
                <TableHead className="w-[100px]">Speed</TableHead>
                <TableHead className="w-[120px] text-right">
                  Current Rank
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {horses.map((horse) => {
                // Get this horse's rank if available
                const rank = rankMap.get(horse.id);
                const isRanked = rank !== undefined;

                return (
                  <TableRow key={horse.id}>
                    <TableCell className="font-medium">{horse.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-5 w-5 rounded-full"
                          style={{ backgroundColor: horse.color }}
                        ></div>
                        <span>Horse #{horse.id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <div className="bg-linear-to-r h-2 flex-1 overflow-hidden rounded-full from-green-500 to-red-500">
                          <div
                            className="h-full bg-transparent"
                            style={{
                              width: `${(horse.speed / 10) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <span className="ml-2 text-xs">
                          {horse.speed.toFixed(1)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {isRanked ? (
                        <Badge
                          variant="outline"
                          className={
                            rank <= 3
                              ? 'bg-green-100 dark:bg-green-900/30'
                              : rank >= horses.length - 2
                                ? 'bg-red-100 dark:bg-red-900/30'
                                : undefined
                          }
                        >
                          #{rank}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Unknown
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
