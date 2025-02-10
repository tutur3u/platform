import { Badge } from '@tutur3u/ui/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/components/ui/card';

export interface Challenge {
  id?: number | null;
  title?: string | null;
  topic?: string | null;
  description?: string | null;
  exampleInput?: string | null;
  exampleOutput?: string | null;
}
interface ProblemStatementProps {
  challenge: Challenge;
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
          <p className="bg-muted whitespace-pre-wrap rounded-md p-3 text-sm">
            {challenge.exampleInput}
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">Example Output:</h3>
          <p className="bg-muted whitespace-pre-wrap rounded-md p-3 text-sm">
            {challenge.exampleOutput}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
