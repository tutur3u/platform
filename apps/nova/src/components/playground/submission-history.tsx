import { Badge } from '@tutur3u/ui/badge';
import { CardContent, CardHeader, CardTitle } from '@tutur3u/ui/card';

interface SubmissionHistoryProps {
  submissions: {
    id: number;
    timestamp: Date;
    status: 'Accepted' | 'Wrong Answer' | 'Runtime Error';
  }[];
}
export function SubmissionHistory({ submissions }: SubmissionHistoryProps) {
  return (
    <>
      <CardHeader>
        <CardTitle>Submission History</CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <p className="text-center text-muted-foreground">
            No submissions yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {submissions.map((submission) => (
              <li
                key={submission.id}
                className="flex items-center justify-between rounded-md bg-muted p-2"
              >
                <span>Submission {submission.id}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">
                    {submission.timestamp.toLocaleString()}
                  </span>
                  <Badge
                    variant={
                      submission.status === 'Accepted'
                        ? 'success'
                        : submission.status === 'Wrong Answer'
                          ? 'destructive'
                          : 'warning'
                    }
                  >
                    {submission.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </>
  );
}
