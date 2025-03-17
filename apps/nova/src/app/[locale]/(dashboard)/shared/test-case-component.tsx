import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Code } from 'lucide-react';

export interface TestCase {
  id: string;
  input: string;
  expected_output?: string;
  actual_output?: string;
  status?: 'success' | 'pending' | 'fail';
}

export interface TestCaseComponentProps {
  testcases: TestCase[];
  className?: string;
}

export default function TestCaseComponent({
  testcases,
  className,
}: TestCaseComponentProps) {
  return (
    <div className={className}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Code className="h-4 w-4 text-primary" />
            Test Cases
          </CardTitle>
        </CardHeader>
        <CardContent>
          {testcases.length > 0 ? (
            <Tabs defaultValue="all">
              <TabsList className="mb-2">
                <TabsTrigger value="all">All Test Cases</TabsTrigger>
                {testcases.map((_, index) => (
                  <TabsTrigger key={index} value={`test-${index}`}>
                    Test {index + 1}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="all">
                <div className="space-y-4">
                  {testcases.map((testcase, index) => (
                    <div key={testcase.id} className="rounded-md border p-3">
                      <div className="mb-2 font-medium">
                        Test Case {index + 1}:
                      </div>
                      <div className="rounded-md bg-muted p-3 font-mono text-sm">
                        {testcase.input}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {testcases.map((testcase, index) => (
                <TabsContent key={index} value={`test-${index}`}>
                  <div className="rounded-md bg-muted p-3 font-mono text-sm">
                    {testcase.input}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <p className="text-muted-foreground">No test cases available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
