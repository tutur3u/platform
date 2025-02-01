import { ModulePackage } from '../modules';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/ui/table';
import { Eye } from 'lucide-react';
import { useState } from 'react';

interface DataPreviewProps {
  module: ModulePackage;
  data: any[] | null;
  type: 'external' | 'internal';
}

export function DataPreview({ module, data, type }: DataPreviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedField, setSelectedField] = useState<string>('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  if (!data || data.length === 0) {
    return null;
  }

  const fields = Object.keys(data[0]).sort();

  // Filter data based on search query and selected field
  const filteredData = data.filter((item) => {
    if (!searchQuery) return true;
    if (!selectedField) {
      return Object.values(item).some((value) =>
        String(value).toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return String(item[selectedField])
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
  });

  // Paginate data
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {type === 'external' ? 'External' : 'Internal'} Data Preview -{' '}
            {module.name}
          </DialogTitle>
          <DialogDescription>
            Preview the data before migration. Showing {filteredData.length} of{' '}
            {data.length} items.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Search</Label>
              <Input
                placeholder="Search data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-[200px]">
              <Label>Search field</Label>
              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger>
                  <SelectValue placeholder="All fields" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All fields</SelectItem>
                  {fields.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {fields.map((field) => (
                    <TableHead key={field}>{field}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((item, index) => (
                  <TableRow key={index}>
                    {fields.map((field) => (
                      <TableCell key={field}>
                        {typeof item[field] === 'object'
                          ? JSON.stringify(item[field])
                          : String(item[field])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-sm">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
