'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Trash } from '@tuturuuu/icons';
import {
  createWorkspaceStorageFolder,
  uploadWorkspaceStorageFile,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';
import * as z from 'zod';

interface FolderProps {
  wsId: string;
  uploadPath?: string;
  data?: {
    name: string;
  };
  onComplete?: () => unknown;
  refreshOnComplete?: boolean;
}

interface Props {
  wsId: string;
  path?: string;
  uploadPath?: string;
  accept?: string;
  onComplete?: () => void;
  refreshOnComplete?: boolean;
  submitLabel?: string;
}

function normalizeWorkspaceStoragePath(wsId: string, value?: string): string {
  if (!value) return '';

  const normalized = value.replace(/^\/+|\/+$/g, '');
  const prefix = `${wsId}/`;

  if (normalized === wsId) {
    return '';
  }

  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;
}

const FolderFormSchema = z.object({
  name: z.string().min(1).max(255),
});

const ObjectFormSchema = z.object({
  files: z.custom<File[]>((value) => {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('At least one file is required');
    }
    return value;
  }),
});

export function StorageFolderForm({
  wsId,
  uploadPath = '',
  data,
  onComplete,
  refreshOnComplete = true,
}: FolderProps) {
  const t = useTranslations();

  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(FolderFormSchema),
    defaultValues: {
      name: '',
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async (payload: z.infer<typeof FolderFormSchema>) =>
      createWorkspaceStorageFolder(
        wsId,
        {
          path: normalizeWorkspaceStoragePath(wsId, uploadPath),
          name: payload.name,
        },
        { fetch }
      ),
  });

  async function onSubmit(data: z.infer<typeof FolderFormSchema>) {
    setLoading(true);
    try {
      await createFolderMutation.mutateAsync(data);
      onComplete?.();
      setLoading(false);
      if (refreshOnComplete) {
        router.refresh();
      }
    } catch (error) {
      setLoading(false);
      toast.error(
        error instanceof Error
          ? error.message
          : 'An error occurred while creating the folder'
      );
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
        <FormField
          control={form.control}
          name="name"
          disabled={loading}
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {t('storage-object-data-table.folder.name')}
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder={t('storage-object-data-table.folder.name')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? t('common.processing')
            : data?.name
              ? t('common.edit')
              : t('common.create')}
        </Button>
      </form>
    </Form>
  );
}

export function StorageObjectForm({
  wsId,
  path,
  uploadPath = '',
  accept,
  onComplete,
  refreshOnComplete = true,
  submitLabel,
}: Props) {
  const t = useTranslations();

  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(ObjectFormSchema),
    defaultValues: {
      files: [],
    },
  });

  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({});
  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});

  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [newFileName, setNewFileName] = useState<string>('');
  const normalizedAccept = accept && accept.trim() !== '*' ? accept : undefined;
  const files = form.watch('files') ?? [];

  function updateFiles(nextFiles: File[]) {
    form.setValue('files', nextFiles, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }

  async function onSubmit(formData: z.infer<typeof ObjectFormSchema>) {
    if (loading || editingFile) return;

    setLoading(true);
    const targetPath = normalizeWorkspaceStoragePath(wsId, path || uploadPath);
    let hasErrors = false;
    const autoExtractResults: Array<{
      status?: string;
      message?: string;
      originalName: string;
    }> = [];
    const finalizeResults: Array<{
      error?: string;
      originalName: string;
    }> = [];

    await Promise.all(
      formData.files.map(async (file) => {
        if (fileStatuses[file.name] === 'uploaded') return;

        setFileStatuses((prev) => ({
          ...prev,
          [file.name]: 'uploading',
        }));
        setFileErrors((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
        setFileProgress((prev) => ({
          ...prev,
          [file.name]: 0,
        }));

        const uploadFile = new File(
          [file],
          `${generateRandomUUID()}_${file.name}`,
          {
            type: file.type,
            lastModified: file.lastModified,
          }
        );

        try {
          const result = await uploadWorkspaceStorageFile(
            wsId,
            uploadFile,
            {
              onUploadProgress: (progress) => {
                setFileProgress((prev) => ({
                  ...prev,
                  [file.name]: progress.percent,
                }));
              },
              path: targetPath,
              upsert: false,
            },
            {
              fetch,
            }
          );

          if (result.autoExtract && result.autoExtract.status !== 'skipped') {
            autoExtractResults.push({
              status: result.autoExtract.status,
              message: result.autoExtract.message,
              originalName: file.name,
            });
          }

          if (!result.finalize?.success && result.finalize?.error) {
            finalizeResults.push({
              error: result.finalize.error,
              originalName: file.name,
            });
          }
        } catch (error) {
          hasErrors = true;
          setFileErrors((prev) => ({
            ...prev,
            [file.name]:
              error instanceof Error ? error.message : t('common.error'),
          }));
          setFileStatuses((prev) => ({
            ...prev,
            [file.name]: 'error',
          }));
          return;
        }

        setFileStatuses((prev) => ({
          ...prev,
          [file.name]: 'uploaded',
        }));
        setFileProgress((prev) => ({
          ...prev,
          [file.name]: 100,
        }));
      })
    );

    if (!hasErrors) {
      for (const result of finalizeResults) {
        toast.warning(`${result.originalName}: ${result.error}`);
      }

      for (const result of autoExtractResults) {
        if (!result.status || result.status === 'skipped' || !result.message) {
          continue;
        }

        if (result.status === 'completed') {
          toast.success(`${result.originalName}: ${result.message}`);
          continue;
        }

        toast.warning(`${result.originalName}: ${result.message}`);
      }

      onComplete?.();
      if (refreshOnComplete) {
        router.refresh();
      }
    } else {
      toast.error(t('common.error'));
    }

    setLoading(false);
  }

  const uploadedAllFiles =
    // at least one file is uploaded
    files.length > 0 &&
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
          render={({ field: { onBlur, name, ref, ...fieldProps } }) => (
            <FormItem>
              <FormLabel>
                {t('storage-object-data-table.files')}
                {files.length > 0 ? ` (${files.length})` : ''}
              </FormLabel>
              {files.length === 0 ? (
                <FormControl>
                  <Input
                    {...fieldProps}
                    ref={ref}
                    name={name}
                    onBlur={onBlur}
                    value={undefined}
                    type="file"
                    placeholder="Files"
                    accept={normalizedAccept}
                    onChange={(e) => {
                      updateFiles(Array.from(e.target.files ?? []));
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
                      <Fragment key={file.name}>
                        <div className="flex items-center justify-between gap-2 p-2">
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
                                  updateFiles(
                                    files.map((f) =>
                                      f.name === file.name
                                        ? new File([file], newFileName, {
                                            lastModified: file.lastModified,
                                            type: file.type,
                                          })
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
                              />
                            ) : (
                              <div
                                className="line-clamp-1 max-w-100 break-all text-sm opacity-70"
                                onClick={() => {
                                  setNewFileName(file.name);
                                  setEditingFile(file);
                                }}
                              >
                                {file.name}
                              </div>
                            )}

                            <div className="font-semibold text-xs">
                              {fileStatuses[file.name] === 'uploading' ? (
                                <span className="opacity-70">
                                  {t('common.uploading')}...
                                  {` ${fileProgress[file.name] ?? 0}%`}
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
                            {fileStatuses[file.name] === 'uploading' ? (
                              <Progress
                                value={fileProgress[file.name] ?? 0}
                                className="mt-2 h-1.5"
                              />
                            ) : null}
                            {fileStatuses[file.name] === 'error' &&
                            fileErrors[file.name] ? (
                              <p className="mt-1 max-w-100 break-words text-destructive text-xs">
                                {fileErrors[file.name]}
                              </p>
                            ) : null}
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
                                setFileErrors((prev) => {
                                  const next = { ...prev };
                                  delete next[file.name];
                                  return next;
                                });
                                setFileProgress((prev) => {
                                  const next = { ...prev };
                                  delete next[file.name];
                                  return next;
                                });

                                updateFiles(
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
                      </Fragment>
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
                updateFiles([]);
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
