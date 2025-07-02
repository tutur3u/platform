import type { NovaProblemTestCase } from '@tuturuuu/types/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Code } from '@tuturuuu/ui/icons';

export interface TestCaseComponentProps {
  testCases: NovaProblemTestCase[];
  className?: string;
}

const copyProtectionStyles: React.CSSProperties = {
  WebkitUserSelect: 'none',
  MozUserSelect: 'none',
  msUserSelect: 'none',
  userSelect: 'none',
  WebkitTouchCallout: 'none',
};

export default function TestCaseComponent({
  testCases,
  className,
}: TestCaseComponentProps) {
  return (
    <div
      className={className}
      style={copyProtectionStyles}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Code className="h-4 w-4 text-primary" />
            Test Cases
          </CardTitle>
          <CardDescription>
            This may include just part of the test cases used to evaluate your
            prompt when submitted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {testCases.length > 0 ? (
            <div className="space-y-6">
              {testCases.map((testcase, index) => (
                <div key={testcase.id} className="rounded-md border p-3">
                  <div className="mb-2 font-medium">Test Case {index + 1}:</div>
                  <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <p className="ml-2 text-sm font-medium">Input</p>
                      <div className="rounded-md bg-muted p-3 font-mono text-sm">
                        {testcase.input ? (
                          <p className="whitespace-pre-wrap">
                            {testcase.input}
                          </p>
                        ) : (
                          <p className="text-muted-foreground italic">
                            No input available
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="ml-2 text-sm font-medium">
                        Output (Expected)
                      </p>
                      <div className="rounded-md bg-muted p-3 font-mono text-sm">
                        {testcase.output ? (
                          <p className="whitespace-pre-wrap">
                            {testcase.output}
                          </p>
                        ) : (
                          <p className="text-muted-foreground italic">
                            No output available
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No test cases available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
