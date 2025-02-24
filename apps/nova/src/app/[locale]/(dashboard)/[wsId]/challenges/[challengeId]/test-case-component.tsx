import { Card } from '@tuturuuu/ui/card';

export default function TestCaseComponent({ testcase }: { testcase?: string }) {
  return (
    <div className="text-foreground pt-3">
      <Card className="min-h-[300px] bg-foreground/10 overflow-y-auto p-4">
        <h2 className="mb-2 text-xl font-bold">Test Case</h2>
        <pre className="bg-foreground/10 whitespace-pre-wrap rounded-md p-2">
          {testcase}
        </pre>
      </Card>
    </div>
  );
}
