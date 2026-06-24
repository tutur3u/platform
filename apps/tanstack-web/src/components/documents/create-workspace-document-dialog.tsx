'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { createWorkspaceDocument } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
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
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import * as z from 'zod';

const formSchema = z.object({
  name: z.string().trim().min(1),
});

type CreateWorkspaceDocumentDialogProps = {
  children: ReactNode;
  locale: string;
  onCreated?: () => Promise<void> | void;
  routeWorkspaceId: string;
  workspaceId: string;
};

export function CreateWorkspaceDocumentDialog({
  children,
  locale,
  onCreated,
  routeWorkspaceId,
  workspaceId,
}: CreateWorkspaceDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useTranslations();
  const tCommon = useTranslations('common');

  const form = useForm({
    resolver: zodResolver(formSchema),
    values: {
      name: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof formSchema>) =>
      createWorkspaceDocument(workspaceId, {
        name: data.name,
      }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : t('documents.create-document-error')
      );
    },
    onSuccess: async (result) => {
      form.reset();
      setOpen(false);
      await onCreated?.();
      await router.navigate({
        href: `/${locale}/${routeWorkspaceId}/documents/${result.id}`,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws-documents.create')}</DialogTitle>
          <DialogDescription>
            {t('ws-documents.create_description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="grid gap-3"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('documents.document-name')}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      disabled={mutation.isPending}
                      placeholder={t('documents.document-name-placeholder')}
                      required
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              className="w-full"
              disabled={mutation.isPending}
              type="submit"
            >
              {mutation.isPending
                ? tCommon('processing')
                : t('ws-documents.create')}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
