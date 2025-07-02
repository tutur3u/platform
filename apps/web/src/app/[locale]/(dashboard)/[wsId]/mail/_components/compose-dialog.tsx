'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Send, X } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const composeSchema = z.object({
  to: z.string().email('Please enter a valid email address'),
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Message content is required'),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

interface ComposeDialogProps {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComposeDialog({
  wsId,
  open,
  onOpenChange,
}: ComposeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations();

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      to: '',
      subject: '',
      content: '',
    },
  });

  async function onSubmit(values: ComposeFormValues) {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/mail/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      // Reset form and close dialog
      form.reset();
      onOpenChange(false);

      // Refresh the page to show the new sent email
      router.refresh();
    } catch (error) {
      console.error('Error sending email:', error);
      // TODO: Add toast notification for error
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-[600px]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {t('mail.compose_email')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              <FormField
                control={form.control}
                name="to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('mail.to')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('mail.recipient_placeholder')}
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('mail.subject')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('mail.subject_placeholder')}
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem className="flex flex-1 flex-col">
                    <FormLabel>{t('mail.message')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('mail.message_placeholder')}
                        className="min-h-[200px] flex-1 resize-none"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-shrink-0 justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <LoadingIndicator className="mr-2" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {t('mail.send_email')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
