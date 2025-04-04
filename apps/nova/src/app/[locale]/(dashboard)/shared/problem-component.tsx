import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { BookOpen, Code, FileText, Info } from '@tuturuuu/ui/icons';

export interface Problem {
  id: string;
  title: string;
  description: string;
  maxPromptLength: number;
  exampleInput: string;
  exampleOutput: string;
}

export interface ProblemComponentProps {
  problem: Problem;
  className?: string;
}

export default function ProblemComponent({
  problem,
  className,
}: ProblemComponentProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">{problem.title}</h2>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          Max Length: {problem.maxPromptLength}
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

        {(problem.exampleInput || problem.exampleOutput) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-primary" />
                Example
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {problem.exampleInput && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Input:</h3>
                  <div className="rounded-md bg-muted p-3 font-mono text-sm">
                    {problem.exampleInput}
                  </div>
                </div>
              )}

              {problem.exampleOutput && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Output:</h3>
                  <div className="rounded-md bg-muted p-3 font-mono text-sm">
                    {problem.exampleOutput}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
