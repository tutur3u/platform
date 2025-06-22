'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Database } from '@tuturuuu/types/supabase';
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Plus, Send, Loader2 } from '@tuturuuu/ui/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as z from 'zod';

type SupportInquiryInsert = Database['public']['Tables']['support_inquiries']['Insert'];

const supportInquirySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  email: z.string().email('Please enter a valid email address'),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject must be less than 200 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000, 'Message must be less than 5000 characters'),
});

type SupportInquiryFormData = z.infer<typeof supportInquirySchema>;



export default function SupportInquiryForm() {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations();
  const supabase = createClient();

  const form = useForm<SupportInquiryFormData>({
    resolver: zodResolver(supportInquirySchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  // Auto-fill user info if available
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        form.setValue('email', user.email || '');
        form.setValue('name', user.user_metadata?.display_name || user.user_metadata?.full_name || '');
      }
    });
  }, [form, supabase]);

  const onSubmit = async (data: SupportInquiryFormData) => {
    setIsLoading(true);
    
    try {
      const inquiryData: SupportInquiryInsert = {
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
        is_read: false,
        is_resolved: false,
      };

      const { error } = await supabase
        .from('support_inquiries')
        .insert([inquiryData]);

      if (error) {
        console.error('Error creating support inquiry:', error);
        toast({
          title: t('support.error'),
          description: t('support.submit_error'),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('support.success'),
        description: t('support.submit_success'),
      });

      form.reset();
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: t('support.error'),
        description: t('support.submit_error'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          {t('support.create_inquiry')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('support.create_inquiry')}</DialogTitle>
          <DialogDescription>
            {t('support.form_description')}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('support.name')}</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder={t('support.name_placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('support.email')}</FormLabel>
                    <FormControl>
                      <Input 
                        type="email"
                        placeholder={t('support.email_placeholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('support.subject')}</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={t('support.subject_placeholder')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('support.subject_description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('support.message')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('support.message_placeholder')}
                      rows={6}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('support.message_description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('support.submitting')}
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    {t('support.submit')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 