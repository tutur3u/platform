'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus, Trash2, Upload } from '@tuturuuu/icons';
import type { VietnameseHoliday } from '@tuturuuu/types/primitives';
import { Button } from '@tuturuuu/ui/button';
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
import { Separator } from '@tuturuuu/ui/separator';
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
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function HolidaysPage() {
  const t = useTranslations('admin-holidays');
  const queryClient = useQueryClient();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(
    currentYear.toString()
  );
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] =
    useState<VietnameseHoliday | null>(null);
  const [deleteConfirmHoliday, setDeleteConfirmHoliday] =
    useState<VietnameseHoliday | null>(null);

  // Form state
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [bulkJson, setBulkJson] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Fetch holidays
  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['holidays', selectedYear],
    queryFn: async () => {
      const params = selectedYear !== 'all' ? `?year=${selectedYear}` : '';
      const res = await fetch(`/api/v1/internal/holidays${params}`);
      if (!res.ok) throw new Error('Failed to fetch holidays');
      return res.json() as Promise<VietnameseHoliday[]>;
    },
  });

  // Create holiday mutation
  const createMutation = useMutation({
    mutationFn: async (data: { date: string; name: string }) => {
      const res = await fetch('/api/v1/internal/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create holiday');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('holiday_created'));
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsAddDialogOpen(false);
      setNewDate('');
      setNewName('');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update holiday mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { date?: string; name?: string };
    }) => {
      const res = await fetch(`/api/v1/internal/holidays/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update holiday');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('holiday_updated'));
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setEditingHoliday(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete holiday mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/internal/holidays/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete holiday');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('holiday_deleted'));
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setDeleteConfirmHoliday(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Bulk import mutation
  const bulkMutation = useMutation({
    mutationFn: async (data: {
      holidays: { date: string; name: string }[];
      replaceExisting: boolean;
    }) => {
      const res = await fetch('/api/v1/internal/holidays/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to import holidays');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(t('bulk_import_success', { count: data.imported }));
      queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setIsBulkDialogOpen(false);
      setBulkJson('');
      setReplaceExisting(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleAddHoliday = () => {
    if (!newDate || !newName.trim()) {
      toast.error(t('fill_required_fields'));
      return;
    }
    createMutation.mutate({ date: newDate, name: newName.trim() });
  };

  const handleUpdateHoliday = () => {
    if (!editingHoliday) return;
    updateMutation.mutate({
      id: editingHoliday.id,
      data: { date: editingHoliday.date, name: editingHoliday.name },
    });
  };

  const handleBulkImport = () => {
    try {
      const parsed = JSON.parse(bulkJson);
      const holidaysArray = Array.isArray(parsed) ? parsed : parsed.holidays;

      if (!Array.isArray(holidaysArray) || holidaysArray.length === 0) {
        toast.error(t('invalid_json_format'));
        return;
      }

      // Validate structure
      const isValid = holidaysArray.every(
        (h: unknown) =>
          typeof h === 'object' &&
          h !== null &&
          'date' in h &&
          'name' in h &&
          typeof (h as { date: unknown }).date === 'string' &&
          typeof (h as { name: unknown }).name === 'string'
      );

      if (!isValid) {
        toast.error(t('invalid_holiday_structure'));
        return;
      }

      bulkMutation.mutate({
        holidays: holidaysArray as { date: string; name: string }[],
        replaceExisting,
      });
    } catch {
      toast.error(t('invalid_json'));
    }
  };

  // Generate year options (current year - 2 to current year + 2)
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-foreground/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-bold text-2xl">
              <Calendar className="h-6 w-6" />
              {t('title')}
            </h1>
            <p className="text-foreground/80">{t('description')}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Year Filter */}
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder={t('year')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('all_years')}</SelectItem>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bulk Import Button */}
            <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Upload className="mr-2 h-4 w-4" />
                  {t('bulk_import')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t('bulk_import')}</DialogTitle>
                  <DialogDescription>
                    {t('bulk_import_description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('json_data')}</Label>
                    <Textarea
                      value={bulkJson}
                      onChange={(e) => setBulkJson(e.target.value)}
                      placeholder={`[
  { "date": "2027-01-01", "name": "New Year" },
  { "date": "2027-01-28", "name": "Tet Day 1" }
]`}
                      rows={8}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="replaceExisting"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="replaceExisting" className="font-normal">
                      {t('replace_existing')}
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsBulkDialogOpen(false)}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    onClick={handleBulkImport}
                    disabled={bulkMutation.isPending}
                  >
                    {bulkMutation.isPending ? t('importing') : t('import')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Add Holiday Button */}
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('add_holiday')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('add_holiday')}</DialogTitle>
                  <DialogDescription>
                    {t('add_holiday_description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('date')}</Label>
                    <Input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('name')}</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t('holiday_name_placeholder')}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    onClick={handleAddHoliday}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? t('adding') : t('add')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmHoliday}
        onOpenChange={(open) => !open && setDeleteConfirmHoliday(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete_holiday')}</DialogTitle>
            <DialogDescription>
              {t('delete_confirm', { name: deleteConfirmHoliday?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmHoliday(null)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmHoliday) {
                  deleteMutation.mutate(deleteConfirmHoliday.id);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? t('deleting') : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Holidays Table */}
      <div className="rounded-lg border border-border bg-foreground/5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">{t('date')}</TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead className="w-20">{t('year')}</TableHead>
              <TableHead className="w-24 text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  {t('loading')}
                </TableCell>
              </TableRow>
            ) : holidays.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  {t('no_holidays')}
                </TableCell>
              </TableRow>
            ) : (
              holidays.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell className="font-mono">{holiday.date}</TableCell>
                  <TableCell>
                    {editingHoliday?.id === holiday.id ? (
                      <Input
                        value={editingHoliday.name}
                        onChange={(e) =>
                          setEditingHoliday({
                            ...editingHoliday,
                            name: e.target.value,
                          })
                        }
                        className="h-8"
                      />
                    ) : (
                      holiday.name
                    )}
                  </TableCell>
                  <TableCell>{holiday.year}</TableCell>
                  <TableCell className="text-right">
                    {editingHoliday?.id === holiday.id ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingHoliday(null)}
                        >
                          {t('cancel')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleUpdateHoliday}
                          disabled={updateMutation.isPending}
                        >
                          {t('save')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingHoliday(holiday)}
                        >
                          {t('edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirmHoliday(holiday)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
