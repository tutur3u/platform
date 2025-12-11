'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';

interface BlacklistEntry {
  id: string;
  entry_type: 'email' | 'domain';
  value: string;
  reason: string | null;
  created_at: string;
}

interface BlacklistResponse {
  entries: BlacklistEntry[];
  total: number;
  limit: number;
  offset: number;
}

export function EmailBlacklistManager() {
  const queryClient = useQueryClient();
  const [entryType, setEntryType] = useState<'email' | 'domain' | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    entry_type: 'email' as 'email' | 'domain',
    value: '',
    reason: '',
  });
  const limit = 20;

  const { data, isLoading, error } = useQuery<BlacklistResponse>({
    queryKey: ['email-blacklist', entryType, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });

      if (entryType !== 'all') {
        params.set('entryType', entryType);
      }

      if (search) {
        params.set('search', search);
      }

      const response = await fetch(`/api/v1/admin/email/blacklist?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch blacklist');
      }
      return response.json();
    },
    staleTime: 10 * 1000,
  });

  const addMutation = useMutation({
    mutationFn: async (entry: typeof newEntry) => {
      const response = await fetch('/api/v1/admin/email/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add entry');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-blacklist'] });
      setIsAddDialogOpen(false);
      setNewEntry({ entry_type: 'email', value: '', reason: '' });
      toast.success('Entry added to blacklist');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/admin/email/blacklist?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove entry');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-blacklist'] });
      toast.success('Entry removed from blacklist');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const handleAddEntry = () => {
    if (!newEntry.value.trim()) {
      toast.error('Please enter a value');
      return;
    }
    addMutation.mutate(newEntry);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const totalPages = Math.ceil((data?.total || 0) / limit);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Email Blacklist</CardTitle>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Blacklist</DialogTitle>
              <DialogDescription>
                Add an email address or domain to the blacklist. Emails to
                blacklisted addresses will be blocked.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="entry_type">Type</Label>
                <Select
                  value={newEntry.entry_type}
                  onValueChange={(value: 'email' | 'domain') =>
                    setNewEntry((prev) => ({ ...prev, entry_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email Address</SelectItem>
                    <SelectItem value="domain">Domain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="value">
                  {newEntry.entry_type === 'email' ? 'Email Address' : 'Domain'}
                </Label>
                <Input
                  id="value"
                  placeholder={
                    newEntry.entry_type === 'email'
                      ? 'spam@example.com'
                      : 'spamdomain.com'
                  }
                  value={newEntry.value}
                  onChange={(e) =>
                    setNewEntry((prev) => ({ ...prev, value: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="Why is this being blacklisted?"
                  value={newEntry.reason}
                  onChange={(e) =>
                    setNewEntry((prev) => ({ ...prev, reason: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddEntry} disabled={addMutation.isPending}>
                {addMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add to Blacklist
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 gap-2">
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="max-w-sm"
            />
            <Button variant="outline" size="icon" onClick={handleSearch}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <Select
            value={entryType}
            onValueChange={(value) => {
              setEntryType(value as 'email' | 'domain' | 'all');
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="email">Emails</SelectItem>
              <SelectItem value="domain">Domains</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-destructive">
            Failed to load blacklist
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge
                          variant={
                            entry.entry_type === 'domain'
                              ? 'secondary'
                              : 'outline'
                          }
                        >
                          {entry.entry_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {entry.value}
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">
                          {entry.reason || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(entry.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (
                              confirm(
                                'Are you sure you want to remove this entry?'
                              )
                            ) {
                              deleteMutation.mutate(entry.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.entries.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No entries found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {data?.total || 0} total entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-muted-foreground text-sm">
                  Page {page + 1} of {Math.max(1, totalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
