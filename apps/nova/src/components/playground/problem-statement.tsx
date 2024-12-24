import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Challenge } from '@/types/challenge'

interface ProblemStatementProps {
  challenge: Challenge
}

export function ProblemStatement({ challenge }: ProblemStatementProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Problem Statement</span>
          <Badge variant="secondary">{challenge.topic}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>{challenge.description}</p>
        <div className="space-y-2">
          <h3 className="font-semibold">Example Input:</h3>
          <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
            {challenge.exampleInput}
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">Example Output:</h3>
          <p className="text-sm bg-muted p-3 rounded-md whitespace-pre-wrap">
            {challenge.exampleOutput}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

