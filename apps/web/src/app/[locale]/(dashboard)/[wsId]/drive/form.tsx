'use client';

import { createClient } from '@/utils/supabase/client';
import { generateRandomUUID } from '@/utils/uuid-helper';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import { Check, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  onComplete?: () => void;
  submitLabel?: string;
}

const FormSchema = z.object({
  files: z.custom<File[]>((value) => {
    if (value.length === 0) {
      throw new Error('At least one file is required');
    }

    return value;
  }),
});

export function StorageObjectForm({ wsId, onComplete, submitLabel }: Props) {
  const t = useTranslations();

  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      files: [],
    },
  });

  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});

  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [newFileName, setNewFileName] = useState<string>('');

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    if (loading || editingFile) return;

    setLoading(true);

    formData.files.forEach(async (file) => {
      // if the file is already uploaded, skip it
      if (fileStatuses[file.name] === 'uploaded') return;

      // Set the status of the file to uploading
      setFileStatuses((prev) => ({
        ...prev,
        [file.name]: 'uploading',
      }));

      const { data: _, error } = await supabase.storage
        .from('workspaces')
        .upload(`${wsId}/${generateRandomUUID()}_${file.name}`, file);

      if (error) {
        setFileStatuses((prev) => ({
          ...prev,
          [file.name]: 'error',
        }));
        return;
      }

      // Set the status of the file to uploaded
      setFileStatuses((prev) => ({
        ...prev,
        [file.name]: 'uploaded',
      }));
    });

    // if all files are uploaded, call onComplete
    if (
      formData.files.every((file) => fileStatuses[file.name] === 'uploaded')
    ) {
      onComplete?.();
    }

    router.refresh();
    setLoading(false);
  }

  const files = form.watch('files');

  const uploadedAllFiles =
    // at least one file is uploaded
    form.watch('files').length > 0 &&
    // all files match the uploaded status
    files.every((file) => fileStatuses[file.name] === 'uploaded') &&
    // all file statuses are uploaded
    Object.values(fileStatuses).every((status) => status === 'uploaded');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="files"
          disabled={loading}
          render={({ field: { value, onChange, ...fieldProps } }) => (
            <FormItem>
              <FormLabel>
                {t('storage-object-data-table.files')}
                {files.length > 0 ? ` (${files.length})` : ''}
              </FormLabel>
              {files.length === 0 ? (
                <FormControl>
                  <Input
                    {...fieldProps}
                    type="file"
                    placeholder="Files"
                    accept="image/*"
                    onChange={(e) => {
                      onChange(e.target.files && Array.from(e.target.files));
                    }}
                    multiple
                  />
                </FormControl>
              ) : (
                <ScrollArea
                  className={`${
                    files.length > 3 ? 'h-48' : 'h-auto'
                  } rounded-md border`}
                >
                  {files
                    // sort "uploaded" files first, then sort by name
                    .sort((a, b) => {
                      if (fileStatuses[a.name] === 'uploaded') return -1;
                      if (fileStatuses[b.name] === 'uploaded') return 1;
                      return a.name.localeCompare(b.name);
                    })
                    .map((file, i) => (
                      <>
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2 p-2"
                        >
                          <div>
                            {editingFile?.name === file.name ? (
                              <input
                                type="text"
                                value={newFileName}
                                className="w-full bg-transparent text-sm outline-0"
                                onChange={(e) => {
                                  setNewFileName(e.target.value);
                                }}
                                onFocus={(e) => {
                                  const value = e.target.value;
                                  const lastIndex = value.lastIndexOf('.');
                                  // Select the part of the text that excludes the file extension
                                  e.target.setSelectionRange(
                                    0,
                                    lastIndex > 0 ? lastIndex : value.length
                                  );
                                }}
                                onBlur={() => {
                                  if (newFileName.trim() === '') {
                                    setNewFileName(file.name);
                                    return;
                                  }

                                  setEditingFile(null);
                                  onChange(
                                    files.map((f) =>
                                      f.name === file.name
                                        ? new File([file], newFileName)
                                        : f
                                    )
                                  );

                                  setNewFileName('');
                                }}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                  }
                                }}
                                autoFocus
                              />
                            ) : (
                              <div
                                className="line-clamp-1 text-sm opacity-70"
                                onClick={() => {
                                  setNewFileName(file.name);
                                  setEditingFile(file);
                                }}
                              >
                                {file.name}
                              </div>
                            )}

                            <div className="text-xs font-semibold">
                              {fileStatuses[file.name] === 'uploading' ? (
                                <span className="opacity-70">
                                  {t('common.uploading')}...
                                </span>
                              ) : fileStatuses[file.name] === 'uploaded' ? (
                                <span>{t('common.uploaded')}</span>
                              ) : fileStatuses[file.name] === 'error' ? (
                                <span className="text-destructive">
                                  {t('common.error')}
                                </span>
                              ) : (
                                <span>{Math.round(file.size / 1024)} KB</span>
                              )}
                            </div>
                          </div>
                          {uploadedAllFiles ||
                          fileStatuses[file.name] === 'uploaded' ? (
                            <Check className="h-5 w-5" />
                          ) : (
                            <Button
                              size="icon"
                              type="button"
                              variant="ghost"
                              className="flex h-7 w-7 shrink-0 items-center justify-center"
                              onClick={() => {
                                setFileStatuses((prev) => {
                                  const next = { ...prev };
                                  delete next[file.name];
                                  return next;
                                });

                                form.setValue(
                                  'files',
                                  files.filter((_, index) => index !== i)
                                );
                              }}
                              disabled={loading}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {i !== files.length - 1 && <div className="border-b" />}
                      </>
                    ))}
                </ScrollArea>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {uploadedAllFiles || (
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              className="w-fit"
              onClick={() => {
                setFileStatuses({});
                form.setValue('files', []);
              }}
              variant="ghost"
              disabled={loading || files.length === 0 || uploadedAllFiles}
            >
              {t('storage-object-data-table.clear_files')}
            </Button>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || files.length === 0 || uploadedAllFiles}
            >
              {loading ? t('common.processing') : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
