'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
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
import { Check, Trash } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import * as z from 'zod';

interface Props {
  chatId: string;
  path?: string;
  uploadPath?: string;
  accept?: string;
  onComplete?: () => void;
  submitLabel?: string;
}

const ObjectFormSchema = z.object({
  files: z.custom<File[]>((value) => {
    if (value.length === 0) {
      throw new Error('At least one file is required');
    }

    return value;
  }),
});

export function StorageObjectForm({
  chatId,
  path,
  uploadPath = '',
  accept = '*',
  onComplete,
  submitLabel,
}: Props) {
  const t = useTranslations();

  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);

  const form = useForm({
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

    const unuploadedFiles = formData.files.filter(
      (file) => fileStatuses[file.name] !== 'uploaded'
    );

    const filesToUpload = unuploadedFiles.slice(0, 10); // giới hạn tối đa 10 file

    await Promise.all(
      filesToUpload.map(async (file) => {
        setFileStatuses((prev) => ({
          ...prev,
          [file.name]: 'uploading',
        }));

        const finalPath = path
          ? joinPath(path, `${generateRandomUUID()}_${file.name}`)
          : joinPath(
              chatId,
              uploadPath,
              `${generateRandomUUID()}_${file.name}`
            );

        const { error } = await supabase.storage
          .from('workspaces')
          .upload(finalPath, file);

        setFileStatuses((prev) => ({
          ...prev,
          [file.name]: error ? 'error' : 'uploaded',
        }));

        if (error) {
          console.error(`Upload failed for ${file.name}:`, error.message);
        }
        try {
          const res = await fetch(`/api/ai/chat/google/`, {
            credentials: 'include',
            method: 'POST',
            body: JSON.stringify({
              model: 'gemini-pro',
              message: `Uploaded file: ${finalPath}`, // hoặc truyền thông tin bạn muốn
            }),
          });

          if (!res.ok) {
            toast({
              title: t('ai_chat.something_went_wrong'),
              description: res.statusText,
            });
          }
        } catch (err) {
          console.error('Call API failed:', err);
        }
      })
    );

    // Check if all selected (or attempted) files are uploaded successfully
    const allUploaded = filesToUpload.every(
      (file) => fileStatuses[file.name] === 'uploaded'
    );

    if (allUploaded) {
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
                                className="line-clamp-1 max-w-[400px] text-sm break-all opacity-70"
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
