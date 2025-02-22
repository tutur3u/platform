import { Card } from '@tuturuuu/ui/card';

export default function TestCaseComponent({ testcase }: { testcase?: string }) {
  return (
    <div className="pt-3">
      <Card className="min-h-[300px] overflow-y-auto p-4">
        <h2 className="mb-2 text-xl font-bold">Test Case</h2>
        <pre className="rounded-md bg-gray-200 p-2 whitespace-pre-wrap">
          {testcase}
        </pre>
      </Card>
    </div>
  );
}
