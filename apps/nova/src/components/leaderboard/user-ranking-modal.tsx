import { LeaderboardEntry } from '@tuturuuu/types/primitives/leaderboard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';

interface UserRankingModalProps {
  user: LeaderboardEntry;
  onClose: () => void;
}

export function UserRankingModal({ user, onClose }: UserRankingModalProps) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{user.username}'s Rankings</DialogTitle>
          <DialogDescription>
            Detailed scores and rankings for each challenge
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Challenge</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Reasoning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.challengeScores.map((score) => (
                <TableRow key={score.challengeId}>
                  <TableCell>{score.challengeName}</TableCell>
                  <TableCell>{score.score}</TableCell>
                  <TableCell>{score.rank}</TableCell>
                  <TableCell>{score.aiReasoning}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
