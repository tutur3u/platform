import { CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { CheckCircle, Loader2, XCircle } from '@tuturuuu/ui/icons';

interface TestCasesProps {
  results: { passed: boolean; message: string }[];
  isLoading: boolean;
}

export function TestCases({ results, isLoading }: TestCasesProps) {
  return (
    <>
      <CardHeader>
        <CardTitle>Test Cases</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground flex h-40 items-center justify-center text-center">
            Run your code to see the test results here.
          </p>
        ) : (
          <ul className="space-y-2">
            {results.map((result, index) => (
              <li
                key={index}
                className="bg-muted flex items-start space-x-2 rounded-md p-2"
              >
                {result.passed ? (
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                )}
                <span>{result.message}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </>
  );
}
