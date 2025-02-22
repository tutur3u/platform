import { CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Loader2 } from 'lucide-react';

interface ResultsDisplayProps {
  results: string[];
  isLoading: boolean;
}

export function ResultsDisplay({ results, isLoading }: ResultsDisplayProps) {
  return (
    <div className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Results</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <p className="flex h-full items-center justify-center text-center text-muted-foreground">
              Submit a prompt to see results here.
            </p>
          ) : (
            <ul className="space-y-4">
              {results.map((result, index) => (
                <li key={index} className="rounded-md bg-muted p-4">
                  <p className="whitespace-pre-wrap">{result}</p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </div>
  );
}
