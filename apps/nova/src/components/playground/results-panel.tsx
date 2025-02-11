import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/components/ui/card';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

interface ResultsPanelProps {
  results: string[];
  isLoading: boolean;
}

export function ResultsPanel({ results, isLoading }: ResultsPanelProps) {
  const getStatusIcon = (result: string) => {
    if (result.toLowerCase().includes('error')) {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    return <CheckCircle className="h-5 w-5 text-green-500" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results and Status</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <p className="flex h-40 items-center justify-center text-center text-muted-foreground">
            Run your prompt to see the results and status here.
          </p>
        ) : (
          <ul className="space-y-4">
            {results.map((result, index) => (
              <li
                key={index}
                className="flex items-start rounded-md bg-muted p-3"
              >
                <div className="mt-1 mr-3">{getStatusIcon(result)}</div>
                <p className="flex-grow text-sm">{result}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
