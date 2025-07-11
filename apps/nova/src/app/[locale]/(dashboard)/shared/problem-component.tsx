import type { NovaProblem, NovaProblemTestCase } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { BookOpen, Code, FileText, Info } from '@tuturuuu/ui/icons';

interface Props {
  problem: NovaProblem & {
    test_cases: NovaProblemTestCase[];
  };
}

const copyProtectionStyles: React.CSSProperties = {
  WebkitUserSelect: 'none',
  MozUserSelect: 'none',
  msUserSelect: 'none',
  userSelect: 'none',
  WebkitTouchCallout: 'none',
};

export default function ProblemComponent({ problem }: Props) {
  return (
    <div
      className="space-y-6"
      style={copyProtectionStyles}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">{problem.title}</h2>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          Max Length: {problem.max_prompt_length}
        </Badge>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4 text-primary" />
              Problem Description
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p className="whitespace-pre-wrap">{problem.description}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Example
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <h3 className="mb-2 text-sm font-medium">Input:</h3>
            <div className="rounded-md bg-muted p-3 font-mono text-sm">
              {problem.example_input ? (
                <p className="whitespace-pre-wrap">{problem.example_input}</p>
              ) : (
                <p className="text-muted-foreground italic">
                  No input available
                </p>
              )}
            </div>

            <h3 className="mb-2 text-sm font-medium">Output:</h3>
            <div className="rounded-md bg-muted p-3 font-mono text-sm">
              {problem.example_output ? (
                <p className="whitespace-pre-wrap">{problem.example_output}</p>
              ) : (
                <p className="text-muted-foreground italic">
                  No output available
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Code className="h-4 w-4 text-primary" />
              Tips for Solving
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Read the problem description carefully</li>
              <li>Consider the example input and output</li>
              <li>Think about edge cases</li>
              <li>Be specific in your prompt instructions</li>
              <li>Test your prompt with custom test cases</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
