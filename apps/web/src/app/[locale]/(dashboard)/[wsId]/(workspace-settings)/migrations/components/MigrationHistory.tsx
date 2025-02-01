import {
  MigrationHistoryEntry,
  clearMigrationHistory,
  getMigrationHistory,
} from '../utils/storage';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/ui/table';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export function MigrationHistory() {
  const [history, setHistory] = useState<MigrationHistoryEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setHistory(getMigrationHistory());
  }, [refreshKey]);

  const handleClearHistory = () => {
    clearMigrationHistory();
    setRefreshKey((prev) => prev + 1);
  };

  const formatDuration = (duration: number) => {
    if (duration < 1000) return `${duration}ms`;
    const seconds = Math.floor(duration / 1000);
    const ms = duration % 1000;
    return `${seconds}s ${ms}ms`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Migration History</h2>
          <p className="text-muted-foreground text-sm">
            Recent migration operations and their results
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((prev) => prev + 1)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearHistory}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear History
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((entry, index) => (
              <TableRow key={index}>
                <TableCell>{formatDate(entry.timestamp)}</TableCell>
                <TableCell className="font-medium">{entry.module}</TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      entry.success
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {entry.success ? 'Success' : 'Failed'}
                  </span>
                </TableCell>
                <TableCell>{entry.itemsProcessed}</TableCell>
                <TableCell>{formatDuration(entry.duration)}</TableCell>
              </TableRow>
            ))}
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  No migration history available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
