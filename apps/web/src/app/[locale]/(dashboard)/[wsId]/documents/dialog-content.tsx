'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tutur3u/ui/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tutur3u/ui/components/ui/form';
import { Input } from '@tutur3u/ui/components/ui/input';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface MyDialogContentProps {
  wsId: string;
}

const FormSchema = z.object({
  name: z.string().min(1),
});

export default function MyDialogContent({ wsId }: MyDialogContentProps) {
  const t = useTranslations();
  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      name: '',
    },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    setLoading(true);
    try {
      await createDocumentAction(wsId, data.name, router, () => {
        form.reset();
      });
    } catch (error) {
      setLoading(false);
      console.error('Failed to create document:', error);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('ws-documents.create')}</DialogTitle>
      </DialogHeader>
      <DialogDescription>
        {t('ws-documents.create_description')}
      </DialogDescription>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('documents.document-name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('documents.document-name-placeholder')}
                    autoComplete="off"
                    required
                    {...field}
                    disabled={loading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('common.processing') : t('ws-documents.create')}
          </Button>
        </form>
      </Form>
    </DialogContent>
  );
}

async function createDocumentAction(
  wsId: string,
  documentName: string,
  router: ReturnType<typeof useRouter>,
  callback: () => void
) {
  try {
    const response = await fetch(`/api/v1/workspaces/${wsId}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: documentName,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create document');
    }

    callback();
    const docId = (await response.json()).id;
    router.push(`/${wsId}/documents/${docId}`);
    router.refresh();
  } catch (error) {
    console.error('Error creating document:', error);
  }
}
