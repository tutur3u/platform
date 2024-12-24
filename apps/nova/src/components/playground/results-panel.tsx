import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

interface ResultsPanelProps {
  results: string[]
  isLoading: boolean
}

export function ResultsPanel({ results, isLoading }: ResultsPanelProps) {
  const getStatusIcon = (result: string) => {
    if (result.toLowerCase().includes('error')) {
      return <XCircle className="h-5 w-5 text-red-500" />
    }
    return <CheckCircle className="h-5 w-5 text-green-500" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results and Status</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground text-center h-40 flex items-center justify-center">
            Run your prompt to see the results and status here.
          </p>
        ) : (
          <ul className="space-y-4">
            {results.map((result, index) => (
              <li key={index} className="bg-muted p-3 rounded-md flex items-start">
                <div className="mr-3 mt-1">{getStatusIcon(result)}</div>
                <p className="text-sm flex-grow">{result}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

