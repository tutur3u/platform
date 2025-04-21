import { ExtendedNovaSubmission } from '../types';
import { NovaProblem, NovaSession } from '@tuturuuu/types/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';

interface SessionCardProps {
  session: NovaSession & {
    problems: (NovaProblem & {
      submissions: ExtendedNovaSubmission[];
    })[];
  };
  sessionIndex: number;
}

export default function SessionCard({
  session,
  sessionIndex,
}: SessionCardProps) {
  // Calculate total score, problems attempted, and total submissions
  const totalScore = session.problems.reduce((sum, problem) => {
    const bestScore =
      problem.submissions.length > 0
        ? Math.max(...problem.submissions.map((s) => s.total_score || 0))
        : 0;
    return sum + bestScore;
  }, 0);

  const problemsAttempted = session.problems.filter(
    (problem) => problem.submissions.length > 0
  ).length;

  const totalSubmissions = session.problems.reduce(
    (sum, problem) => sum + problem.submissions.length,
    0
  );

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Session {sessionIndex + 1}</CardTitle>
        <CardDescription>
          <p>Started on {new Date(session.created_at).toLocaleString()}</p>
          {session.end_time && (
            <p>Ended on {new Date(session.end_time).toLocaleString()}</p>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col items-center rounded-lg border p-3">
            <span className="text-muted-foreground text-sm">Total Score</span>
            <span className="text-2xl font-bold">
              {totalScore.toFixed(2)}/{session.problems.length * 10}
            </span>
          </div>
          <div className="flex flex-col items-center rounded-lg border p-3">
            <span className="text-muted-foreground text-sm">
              Problems Attempted
            </span>
            <span className="text-2xl font-bold">
              {problemsAttempted}/{session.problems.length}
            </span>
          </div>
          <div className="flex flex-col items-center rounded-lg border p-3">
            <span className="text-muted-foreground text-sm">
              Total Submissions
            </span>
            <span className="text-2xl font-bold">{totalSubmissions}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
