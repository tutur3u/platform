import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface TestCasesProps {
  results: { passed: boolean; message: string }[]
  isLoading: boolean
}

export function TestCases({ results, isLoading }: TestCasesProps) {
  return (
    <>
      <CardHeader>
        <CardTitle>Test Cases</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground text-center h-40 flex items-center justify-center">
            Run your code to see the test results here.
          </p>
        ) : (
          <ul className="space-y-2">
            {results.map((result, index) => (
              <li key={index} className="flex items-start space-x-2 bg-muted p-2 rounded-md">
                {result.passed ? (
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <span>{result.message}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </>
  )
}

