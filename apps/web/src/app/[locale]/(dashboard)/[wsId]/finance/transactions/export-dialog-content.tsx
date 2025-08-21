'use client';

import { Button } from '@tuturuuu/ui/button';
import { Download } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface ExportDialogContentProps {
  wsId: string;
  exportType: string;
  searchParams: any;
}

export function ExportDialogContent({
  wsId,
  exportType,
  searchParams,
}: ExportDialogContentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [format, setFormat] = useState('csv');
  const [dateRange, setDateRange] = useState('all');

  const handleExport = async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        format,
        dateRange,
        ...searchParams,
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/finance/${exportType}/export?${params}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to export data');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportType}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export completed successfully');
    } catch (error) {
      toast.error('Failed to export data');
      console.error('Error exporting data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="format">Export Format</Label>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="csv">CSV</SelectItem>
            <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dateRange">Date Range</Label>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
            <SelectItem value="last_year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleExport} disabled={isLoading} className="w-full">
        <Download className="mr-2 h-4 w-4" />
        {isLoading ? 'Exporting...' : `Export ${exportType}`}
      </Button>
    </div>
  );
}
