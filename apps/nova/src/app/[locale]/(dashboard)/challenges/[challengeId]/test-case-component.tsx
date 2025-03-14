import { NovaProblemTestCase } from '@tuturuuu/types/db';
import { Card } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';

export default function TestCaseComponent({
  testcases,
}: {
  testcases: NovaProblemTestCase[];
}) {
  return (
    <div className="pt-3 text-foreground">
      <Card className="min-h-[300px] overflow-y-auto bg-foreground/10 p-4">
        <h2 className="mb-2 text-xl font-bold">Test Cases</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          These are the default test cases for this problem. You can also create
          custom test cases to test your prompt in the prompt section.
        </p>

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
              <pre className="rounded-md bg-foreground/10 p-2 whitespace-pre-wrap">
                {testcases?.map((testcase, index) => (
                  <div key={testcase.id} className="mb-4 text-sm">
                    <div className="mb-1 font-medium">
                      Test Case {index + 1}:
                    </div>
                    {testcase.input}
                  </div>
                ))}
              </pre>
            </TabsContent>

            {testcases.map((testcase, index) => (
              <TabsContent key={index} value={`test-${index}`}>
                <pre className="rounded-md bg-foreground/10 p-2 text-sm whitespace-pre-wrap">
                  {testcase.input}
                </pre>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <p>No test cases available.</p>
        )}
      </Card>
    </div>
  );
}
