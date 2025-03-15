'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
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

export type LeaderboardEntry = {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  score: number;
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
  return (
    <div className="rounded-md border shadow">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>User</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 10 }).map((_, i) => (
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
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableCell>
              </TableRow>
            ))}

          {!isLoading &&
            data.map((entry) => (
              <motion.tr
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  'transition-colors hover:bg-muted/70',
                  currentUserId === entry.id &&
                    'bg-primary/5 hover:bg-primary/10'
                )}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                        entry.rank === 1
                          ? 'bg-yellow-500 text-black'
                          : entry.rank === 2
                            ? 'bg-gray-300 text-black'
                            : entry.rank === 3
                              ? 'bg-amber-700 text-white'
                              : entry.rank <= 10
                                ? 'bg-green-500 text-white'
                                : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {entry.rank}
                    </span>
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
                <TableCell className="text-right font-semibold">
                  {entry.score.toLocaleString()}
                </TableCell>
              </motion.tr>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
