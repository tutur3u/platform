import { NovaProblemTestCase } from '@tuturuuu/types/db';
import { Card } from '@tuturuuu/ui/card';

export default function TestCaseComponent({
  testcases,
}: {
  testcases: NovaProblemTestCase[];
}) {
  return (
    <div className="text-foreground pt-3">
      <Card className="bg-foreground/10 min-h-[300px] overflow-y-auto p-4">
        <h2 className="mb-2 text-xl font-bold">Test Case</h2>
        {testcases.length > 0 ? (
          <pre className="bg-foreground/10 whitespace-pre-wrap rounded-md p-2">
            {testcases?.map((testcase) => (
              <div key={testcase.id} className="mb-2 text-sm">
                {testcase.testcase_content}
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
