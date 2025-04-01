'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { generateUUID } from '@tuturuuu/utils/uuid-helper';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as XLSX from 'xlsx';

export default function ImportDialogContent({ wsId }: { wsId: string }) {
  const router = useRouter();
  const t = useTranslations();

  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File>();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ fullName: string; email: string }[]>([]);
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (
        selectedFile.type !==
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) {
        setError(t('common.invalid-file-type'));
        setFile(undefined);
      } else {
        setError(null);
        setFile(selectedFile);
        loadFile(selectedFile);
      }
    }
  };

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });

      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setError(t('common.no-sheets-found'));
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      if (sheet) {
        const jsonData = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
        }) as any[][];
        const formattedData = jsonData
          .map((row: any[]) => ({
            fullName: sentenceCase(row[1]) || '',
            email: row[0]?.toLowerCase(),
          }))
          // only take rows with email
          .filter((row) => row.email)
          // filter duplicated emails
          .filter(
            (row, index, self) =>
              index === self.findIndex((r) => r.email === row.email)
          )
          .sort((a, b) => a.fullName.localeCompare(b.fullName));
        setData(formattedData);
      } else {
        setError(t('common.no-sheets-found'));
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const sentenceCase = (str: string | undefined) => {
    return str
      ?.toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleFirstPage = () => {
    setPage(0);
  };

  const handleLastPage = () => {
    setPage(totalPages - 1);
  };

  const handleNextPage = () => {
    setPage((prevPage) => prevPage + 1);
  };

  const handlePrevPage = () => {
    setPage((prevPage) => Math.max(prevPage - 1, 0));
  };

  const fetchExistingUsers = async (supabase: any, wsId: string) => {
    let existingUsers: any[] = [];
    let from = 0;
    const batchSize = 100;

    while (true) {
      const { data, error } = await supabase
        .from('workspace_users')
        .select('email')
        .eq('ws_id', wsId)
        .range(from, from + batchSize - 1);

      if (error) {
        throw new Error(error.message);
      }

      if (data.length === 0) {
        break;
      }

      existingUsers = existingUsers.concat(data);
      from += batchSize;
    }

    return existingUsers;
  };

  const handleImport = async () => {
    setUploading(true);
    setProgress(0);

    const supabase = createClient();

    try {
      // Fetch existing users in batches
      const existingUsers = await fetchExistingUsers(supabase, wsId);
      const existingEmails = new Set(existingUsers.map((user) => user.email));

      // Filter out users that already exist
      const newData = data.filter((row) => !existingEmails.has(row.email));

      const rowsPerBatch = 100;
      const totalBatches = Math.ceil(newData.length / rowsPerBatch);

      for (let i = 0; i < totalBatches; i++) {
        const batch = newData.slice(i * rowsPerBatch, (i + 1) * rowsPerBatch);
        const formattedBatch = batch.map((row) => ({
          id: generateUUID(wsId, row.email.toLowerCase()),
          full_name: row.fullName,
          email: row.email,
          ws_id: wsId,
        }));

        const { error } = await supabase
          .from('workspace_users')
          .insert(formattedBatch);

        if (error) {
          throw new Error(error.message);
        }

        setProgress(((i + 1) / totalBatches) * 100);
      }

      setUploading(false);
      setUploaded(true);
      router.refresh();
    } catch (error: any) {
      setError(error.message);
      setUploading(false);
    }
  };

  const rowsPerPage = 5;
  const totalEntries = data.length;
  const totalPages = Math.ceil(totalEntries / rowsPerPage);
  const paginatedData = data.slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('common.import')}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-1">
        <div className="grid w-full max-w-sm items-center gap-2">
          <Label htmlFor="file">{t('common.file-name')}</Label>
          <Input
            type="file"
            id="file"
            placeholder={t('common.file-name')}
            onChange={handleFileChange}
            accept=".xlsx"
            className="input-class w-full pb-4"
            disabled={uploading || uploaded}
          />
          {error && <p className="text-red-500">{error}</p>}
        </div>

        {data.length > 0 && (
          <div>
            <Separator className="my-2" />
            <div className="mb-2 font-semibold">
              {totalEntries} {t('common.row(s)')}
            </div>
            <div className="grid gap-2">
              {paginatedData.map((row, index) => (
                <div
                  key={index}
                  className="rounded border border-foreground/5 bg-foreground/5 p-2"
                >
                  <div className="line-clamp-1 font-semibold">
                    {row.fullName}
                  </div>
                  <div className="line-clamp-1 text-sm opacity-70">
                    {row.email}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button
                  size="xs"
                  onClick={handleFirstPage}
                  disabled={page === 0}
                >
                  <ArrowLeftToLine />
                </Button>
                <Button
                  size="xs"
                  onClick={handlePrevPage}
                  disabled={page === 0}
                >
                  <ChevronLeft />
                </Button>
              </div>
              <div>
                {t('common.page')}{' '}
                <span className="font-semibold">{page + 1}</span> /{' '}
                <span className="font-semibold">{totalPages}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="xs"
                  onClick={handleNextPage}
                  disabled={(page + 1) * rowsPerPage >= data.length}
                >
                  <ChevronRight />
                </Button>
                <Button
                  size="xs"
                  onClick={handleLastPage}
                  disabled={(page + 1) * rowsPerPage >= data.length}
                >
                  <ArrowRightToLine />
                </Button>
              </div>
            </div>
            <Separator className="mt-2" />
          </div>
        )}

        {uploading && (
          <div>
            <Progress className="h-2 w-full" value={progress} />
          </div>
        )}
      </div>

      <DialogFooter className="justify-between">
        {uploaded || (
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t('common.cancel')}
            </Button>
          </DialogClose>
        )}

        <Button
          onClick={handleImport}
          disabled={uploaded || uploading || !file}
        >
          {uploaded && <CheckCheck />}
          {uploaded
            ? t('common.uploaded')
            : uploading
              ? t('common.processing')
              : t('common.import')}
        </Button>
      </DialogFooter>
    </>
  );
}
