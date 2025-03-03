import { NovaProblemTestCase } from '@tuturuuu/types/db';
import { Card } from '@tuturuuu/ui/card';

export default function TestCaseComponent({
  testcases,
}: {
  testcases: NovaProblemTestCase[];
}) {
  return (
    <div className="pt-3 text-foreground">
      <Card className="min-h-[300px] overflow-y-auto bg-foreground/10 p-4">
        <h2 className="mb-2 text-xl font-bold">Test Case</h2>
        {testcases.length > 0 ? (
          <pre className="rounded-md bg-foreground/10 p-2 whitespace-pre-wrap">
            {testcases?.map((testcase) => (
              <div key={testcase.id} className="mb-2 text-sm">
                {testcase.input}
              </div>
            ))}
          </pre>
        ) : (
          <p>No test cases available.</p>
        )}
      </Card>
    </div>
  );
}
