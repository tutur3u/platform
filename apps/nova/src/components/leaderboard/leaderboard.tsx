'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Minus } from 'lucide-react';

export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  score: number;
  country: string | undefined;
  change: number;
};

interface LeaderboardProps {
  data: LeaderboardEntry[];
  isLoading?: boolean;
  currentUserId?: string;
}

export function Leaderboard({
  data,
  isLoading = false,
  currentUserId,
}: LeaderboardProps) {
  if (isLoading) {
    return (
      <div className="mt-6 w-full overflow-hidden rounded-md border shadow">
        <div className="w-full overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Rank</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-6 w-10" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-4 w-12" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 w-full overflow-hidden rounded-md border shadow">
      <div className="w-full overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Rank</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((entry) => (
              <motion.tr
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'group transition-colors hover:bg-muted/50',
                  currentUserId === entry.id &&
                    'bg-primary/5 hover:bg-primary/10'
                )}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {entry.rank <= 10 && (
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                          entry.rank === 1
                            ? 'bg-yellow-500 text-black'
                            : entry.rank === 2
                              ? 'bg-gray-300 text-black'
                              : entry.rank === 3
                                ? 'bg-amber-700 text-white'
                                : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {entry.rank}
                      </span>
                    )}
                    {entry.rank > 10 && entry.rank}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={entry.avatar} alt={entry.name} />
                      <AvatarFallback>{entry.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        'font-medium',
                        currentUserId === entry.id && 'font-bold text-primary'
                      )}
                    >
                      {entry.name}
                      {currentUserId === entry.id && ' (You)'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{entry.country}</TableCell>
                <TableCell className="text-right font-semibold">
                  {entry.score.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={
                      entry.change > 0
                        ? 'success'
                        : entry.change < 0
                          ? 'destructive'
                          : 'outline'
                    }
                    className="px-1.5 py-0"
                  >
                    <div className="flex items-center gap-1">
                      {entry.change > 0 ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : entry.change < 0 ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <Minus className="h-3.5 w-3.5" />
                      )}
                      {Math.abs(entry.change)}
                    </div>
                  </Badge>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
