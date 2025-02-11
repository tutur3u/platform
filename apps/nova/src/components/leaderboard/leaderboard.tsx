'use client';

import { UserRankingModal } from './user-ranking-modal';
import { LeaderboardEntry } from '@tutur3u/types/primitives/leaderboard';
import { Button } from '@tutur3u/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tutur3u/ui/table';
import { useState } from 'react';

interface LeaderboardProps {
  data: LeaderboardEntry[];
}

export function Leaderboard({ data }: LeaderboardProps) {
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(
    null
  );

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rank</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Total Score</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry, index) => (
            <TableRow key={entry.userId}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell>{entry.username}</TableCell>
              <TableCell>{entry.totalScore}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  onClick={() => setSelectedUser(entry)}
                >
                  View Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedUser && (
        <UserRankingModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </>
  );
}
