import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2 } from 'lucide-react'

interface ResultsDisplayProps {
  results: string[]
  isLoading: boolean
}

export function ResultsDisplay({ results, isLoading }: ResultsDisplayProps) {
  return (
    <div className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Results</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground text-center h-full flex items-center justify-center">
              Submit a prompt to see results here.
            </p>
          ) : (
            <ul className="space-y-4">
              {results.map((result, index) => (
                <li key={index} className="bg-muted p-4 rounded-md">
                  <p className="whitespace-pre-wrap">{result}</p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </div>
  )
}

