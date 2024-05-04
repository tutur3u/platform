'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import useTranslation from 'next-translate/useTranslation';
import { toast } from '@/components/ui/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash } from 'lucide-react';

interface Props {
  wsId: string;
  data?: {
    id: string;
    name: string;
  };
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

export function TransactionForm({
  wsId,
  data,
  onComplete,
  submitLabel,
}: Props) {
  const { t } = useTranslation('common');

  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      files: [],
    },
  });

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(
      data?.id
        ? `/api/workspaces/${wsId}/transactions/${data.id}`
        : `/api/workspaces/${wsId}/transactions`,
      {
        method: data?.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      }
    );

    if (res.ok) {
      router.refresh();
      if (onComplete) onComplete();
    } else {
      setLoading(false);
      toast({
        title: 'Error creating category',
        description: 'An error occurred while creating the category',
      });
    }
  }

  const files = form.watch('files');

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
                Files{files.length > 0 ? ` (${files.length})` : ''}
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
                    files.length > 3 ? 'h-32' : 'h-auto'
                  } rounded-md border`}
                >
                  {files.map((file, i) => (
                    <>
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 p-2"
                      >
                        <span className="line-clamp-1">
                          {file.name} {file.name} {file.name} {file.name}{' '}
                          {file.name} {file.name} {file.name} {file.name}{' '}
                          {file.name} {file.name} {file.name} {file.name}{' '}
                          {file.name}
                        </span>
                        <Button
                          size="icon"
                          type="button"
                          variant="destructive"
                          className="flex h-7 w-7 shrink-0 items-center justify-center"
                          onClick={() =>
                            form.setValue(
                              'files',
                              files.filter((_, index) => index !== i)
                            )
                          }
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
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

        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            className="w-fit"
            onClick={() => form.setValue('files', [])}
            variant="ghost"
            disabled={loading || files.length === 0}
          >
            Clear files
          </Button>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || files.length === 0}
          >
            {loading ? t('common:processing') : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
