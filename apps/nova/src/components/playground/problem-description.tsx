import { Badge } from '@repo/ui/components/ui/badge';
import {
  CardContent,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/ui/card';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';

export interface Challenge {
  id?: number | null;
  title?: string | null;
  topic?: string | null;
  description?: string | null;
  exampleInput?: string | null;
  exampleOutput?: string | null;
}
interface ProblemDescriptionProps {
  challenge: Challenge;
}

export function ProblemDescription({ challenge }: ProblemDescriptionProps) {
  return (
    <div className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>{challenge.title}</span>
          <Badge variant="secondary">{challenge.topic}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-grow p-0">
        <ScrollArea className="h-full">
          <div className="space-y-4 p-6">
            <div className="prose dark:prose-invert">
              <p>{challenge.description}</p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Example Input:</h3>
              <pre className="overflow-x-auto rounded-md bg-muted p-2">
                <code>{challenge.exampleInput}</code>
              </pre>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Example Output:</h3>
              <pre className="overflow-x-auto rounded-md bg-muted p-2">
                <code>{challenge.exampleOutput}</code>
              </pre>
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </div>
  );
}
