import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface SubmissionHistoryProps {
  submissions: {
    id: number
    timestamp: Date
    status: 'Accepted' | 'Wrong Answer' | 'Runtime Error'
  }[]
}

export function SubmissionHistory({ submissions }: SubmissionHistoryProps) {
  return (
    <>
      <CardHeader>
        <CardTitle>Submission History</CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length === 0 ? (
          <p className="text-muted-foreground text-center">No submissions yet.</p>
        ) : (
          <ul className="space-y-2">
            {submissions.map((submission) => (
              <li key={submission.id} className="flex justify-between items-center bg-muted p-2 rounded-md">
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
  )
}

