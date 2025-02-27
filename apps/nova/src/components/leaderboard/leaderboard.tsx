'use client';

import { UserRankingModal } from './user-ranking-modal';
import { LeaderboardEntry } from '@tuturuuu/types/primitives/leaderboard';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { Medal, Trophy, User } from 'lucide-react';
import { useState } from 'react';

interface LeaderboardProps {
  data: LeaderboardEntry[];
}

export function Leaderboard({ data }: LeaderboardProps) {
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(
    null
  );

  const getRankBadge = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 2:
        return <Medal className="h-5 w-5 text-amber-600" />;
      default:
        return index + 1;
    }
  };

  if (!data.length) {
    return (
      <Card className="flex h-96 items-center justify-center text-muted-foreground">
        No leaderboard data available
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-16 text-center">Rank</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Total Score</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((entry, index) => (
              <TableRow
                key={entry.userId}
                className={cn(
                  index === 0 &&
                    'bg-yellow-100 hover:bg-yellow-100 dark:bg-yellow-900 dark:hover:bg-yellow-900',
                  index === 1 &&
                    'bg-gray-100 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-900',
                  index === 2 &&
                    'bg-amber-100 hover:bg-amber-100 dark:bg-amber-900 dark:hover:bg-amber-900'
                )}
              >
                <TableCell className="text-center font-medium">
                  <span className="flex items-center justify-center">
                    {getRankBadge(index)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={`https://avatar.vercel.sh/${entry.username}`}
                        alt={entry.username}
                      />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{entry.username}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          index === 0 && 'bg-yellow-500',
                          index === 1 && 'bg-gray-400',
                          index === 2 && 'bg-amber-600',
                          index > 2 && 'bg-primary'
                        )}
                        style={{
                          width: `${
                            (entry.totalScore / (data[0]?.totalScore ?? 0)) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="tabular-nums">{entry.totalScore}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedUser(entry)}
                  >
                    View Details
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {selectedUser && (
        <UserRankingModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </>
  );
}
