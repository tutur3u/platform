import { Card } from '@tuturuuu/ui/card';

export default function TestCaseComponent({ testcase }: { testcase?: string }) {
  console.log(testcase, 'casdlm');
  return (
    <div className="pt-3 text-foreground">
      <Card className="min-h-[300px] overflow-y-auto bg-foreground/10 p-4">
        <h2 className="mb-2 text-xl font-bold">Test Case</h2>
        <pre className="rounded-md bg-foreground/10 p-2 whitespace-pre-wrap">
          {testcase}
        </pre>
      </Card>
    </div>
  );
}
