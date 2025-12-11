'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { ChevronLeft, ChevronRight, Loader2, Search } from '@tuturuuu/icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

interface AuditRecord {
  id: string;
  ws_id: string;
  user_id: string | null;
  provider: string;
  source_name: string;
  source_email: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  template_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  message_id: string | null;
  error_message: string | null;
  ip_address: string | null;
  created_at: string;
  sent_at: string | null;
}

interface AuditResponse {
  records: AuditRecord[];
  total: number;
  limit: number;
  offset: number;
}

type EmailStatus = 'pending' | 'sent' | 'failed' | 'bounced' | 'complained';

export function EmailAuditTable() {
  const [status, setStatus] = useState<EmailStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, isLoading, error } = useQuery<AuditResponse>({
    queryKey: ['email-audit', status, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });

      if (status !== 'all') {
        params.set('status', status);
      }

      if (search) {
        params.set('search', search);
      }

      const response = await fetch(`/api/v1/admin/email/audit?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit records');
      }
      return response.json();
    },
    staleTime: 10 * 1000,
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const getStatusBadge = (recordStatus: string) => {
    switch (recordStatus) {
      case 'sent':
        return (
          <Badge variant="outline" className="border-green-500 text-green-600">
            Sent
          </Badge>
        );
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'bounced':
        return (
          <Badge
            variant="outline"
            className="border-yellow-500 text-yellow-600"
          >
            Bounced
          </Badge>
        );
      case 'complained':
        return (
          <Badge
            variant="outline"
            className="border-orange-500 text-orange-600"
          >
            Complaint
          </Badge>
        );
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="secondary">{recordStatus}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const totalPages = Math.ceil((data?.total || 0) / limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Audit Log</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 gap-2">
            <Input
              placeholder="Search subject or email..."
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
            value={status}
            onValueChange={(value) => {
              setStatus(value as EmailStatus | 'all');
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="complained">Complaint</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-destructive py-8 text-center">
            Failed to load audit records
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(record.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate text-sm">
                          {record.to_addresses.join(', ')}
                        </div>
                        {(record.cc_addresses.length > 0 ||
                          record.bcc_addresses.length > 0) && (
                          <div className="text-muted-foreground text-xs">
                            +
                            {record.cc_addresses.length +
                              record.bcc_addresses.length}{' '}
                            more
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[250px] truncate font-medium">
                          {record.subject}
                        </div>
                        {record.error_message && (
                          <div className="text-destructive max-w-[250px] truncate text-xs">
                            {record.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {record.template_type ? (
                          <Badge variant="secondary" className="font-normal">
                            {record.template_type}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm uppercase">
                        {record.provider}
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.records.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-muted-foreground py-8 text-center"
                      >
                        No records found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Showing {data?.records.length || 0} of {data?.total || 0}{' '}
                records
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
