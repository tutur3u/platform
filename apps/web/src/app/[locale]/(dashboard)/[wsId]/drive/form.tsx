'use client';

import { joinPath } from '@/utils/path-helper';
import { createClient } from '@tuturuuu/supabase/next/client';
import { EMPTY_FOLDER_PLACEHOLDER_NAME } from '@tuturuuu/types/primitives/StorageObject';
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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { Check, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import * as z from 'zod';

interface FolderProps {
  wsId: string;
  uploadPath?: string;
  data?: {
    name: string;
  };
  onComplete?: () => unknown;
}

interface Props {
  wsId: string;
  path?: string;
  uploadPath?: string;
  accept?: string;
  onComplete?: () => void;
  submitLabel?: string;
}

const FolderFormSchema = z.object({
  name: z.string().min(1).max(255),
});

const ObjectFormSchema = z.object({
  files: z.custom<File[]>((value) => {
    if (value.length === 0) {
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
}: FolderProps) {
  const t = useTranslations();

  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof FolderFormSchema>>({
    resolver: zodResolver(FolderFormSchema),
    defaultValues: {
      name: '',
    },
  });

  async function onSubmit(data: z.infer<typeof FolderFormSchema>) {
    setLoading(true);

    const placeholderFile = new File([''], EMPTY_FOLDER_PLACEHOLDER_NAME);

    const { error } = await supabase.storage
      .from('workspaces')
      .upload(
        joinPath(wsId, uploadPath, data.name, placeholderFile.name),
        placeholderFile
      );

    if (!error) {
      onComplete?.();
      setLoading(false);
      router.refresh();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating folder',
        description: 'An error occurred while creating the folder',
      });
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
  accept = 'image/*',
  onComplete,
  submitLabel,
}: Props) {
  const t = useTranslations();

  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof ObjectFormSchema>>({
    resolver: zodResolver(ObjectFormSchema),
    defaultValues: {
      files: [],
    },
  });

  const [fileStatuses, setFileStatuses] = useState<Record<string, string>>({});

  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [newFileName, setNewFileName] = useState<string>('');

  async function onSubmit(formData: z.infer<typeof ObjectFormSchema>) {
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

      const { error } = await supabase.storage
        .from('workspaces')
        .upload(
          path ||
            joinPath(wsId, uploadPath, `${generateRandomUUID()}_${file.name}`),
          file
        );

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
          render={({ field: { onChange, ...fieldProps } }) => (
            <FormItem>
              <FormLabel>
                {t('storage-object-data-table.files')}
                {files.length > 0 ? ` (${files.length})` : ''}
              </FormLabel>
              {files.length === 0 ? (
                <FormControl>
                  <Input
                    {...fieldProps}
                    value={undefined}
                    type="file"
                    placeholder="Files"
                    accept={accept}
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
