import { Download, FileJson, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import type { TranslationStatusFilter } from './types';

type TranslationControlsProps = {
  labels: {
    allNamespaces: string;
    allStatuses: string;
    complete: string;
    csv: string;
    json: string;
    missingEn: string;
    missingVi: string;
    namespace: string;
    pageSize: string;
    search: string;
    status: string;
  };
  namespace: string;
  namespaces: string[];
  onExportCsv: () => void;
  onExportJson: () => void;
  onNamespaceChange: (value: string) => void;
  onPageSizeChange: (value: number) => void;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: TranslationStatusFilter) => void;
  pageSize: number;
  query: string;
  status: TranslationStatusFilter;
};

const pageSizeOptions = [25, 50, 100, 200];

export function TranslationControls({
  labels,
  namespace,
  namespaces,
  onExportCsv,
  onExportJson,
  onNamespaceChange,
  onPageSizeChange,
  onQueryChange,
  onStatusChange,
  pageSize,
  query,
  status,
}: TranslationControlsProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_120px_auto]">
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={labels.search}
          className="pl-9"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={labels.search}
          value={query}
        />
      </div>
      <Select onValueChange={onNamespaceChange} value={namespace}>
        <SelectTrigger aria-label={labels.namespace}>
          <SelectValue placeholder={labels.allNamespaces} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allNamespaces}</SelectItem>
          {namespaces.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) =>
          onStatusChange(value as TranslationStatusFilter)
        }
        value={status}
      >
        <SelectTrigger aria-label={labels.status}>
          <SelectValue placeholder={labels.allStatuses} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.allStatuses}</SelectItem>
          <SelectItem value="complete">{labels.complete}</SelectItem>
          <SelectItem value="missing-vi">{labels.missingVi}</SelectItem>
          <SelectItem value="missing-en">{labels.missingEn}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) => onPageSizeChange(Number(value))}
        value={String(pageSize)}
      >
        <SelectTrigger aria-label={labels.pageSize}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {pageSizeOptions.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button onClick={onExportCsv} variant="outline">
          <Download className="h-4 w-4" />
          {labels.csv}
        </Button>
        <Button onClick={onExportJson} variant="outline">
          <FileJson className="h-4 w-4" />
          {labels.json}
        </Button>
      </div>
    </div>
  );
}
