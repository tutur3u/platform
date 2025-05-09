'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Check, Eye, EyeOff, Loader2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import * as z from 'zod';

export default function ApiKeyInput({
  defaultValue,
}: {
  defaultValue?: string | null;
}) {
  const t = useTranslations('ai_chat');
  const [saving, setSaving] = useState(false);
  const [validated, setValidated] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (defaultValue) {
      setValidated(true);
    }
  }, [defaultValue]);

  const FormSchema = z.object({
    apiKey: z
      .string()
      .min(1, { message: t('api-key-required') })
      .regex(/^AIza[0-9A-Za-z\-_]{35}$/, { message: t('api-key-required') }),
  });

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      apiKey: defaultValue ?? '',
    },
  });

  const apiKey = form.watch('apiKey');

  async function validateApiKey(key: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Hello! Please just respond with "Ok" if I was able to reach you!',
                  },
                ],
              },
            ],
          }),
        }
      );
      if (res.ok) {
        return true;
      } else {
        console.error('Response error:', await res.text());
      }
    } catch (err) {
      console.error('Fetch error:', err);
    }
    return false;
  }

  async function onSave(data: z.infer<typeof FormSchema>) {
    setSaving(true);
    try {
      const isValid = await validateApiKey(data.apiKey);

      if (!isValid) {
        toast({
          title: t('api-key-invalid-title'),
          description: t('api-key-invalid-desc'),
          variant: 'destructive',
        });
        setValidated(false);
        return;
      }

      const response = await fetch('/api/ai/chat/google/key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey: data.apiKey }),
      });

      if (!response.ok) {
        throw new Error('Failed to save API key');
      }

      toast({
        title: t('api-key-valid-title'),
        description: t('api-key-valid-desc'),
      });
      setValidated(true);
      router.refresh();
    } catch (error) {
      toast({
        title: t('api-key-invalid-title'),
        description: t('api-key-invalid-desc'),
        variant: 'destructive',
      });
      setValidated(false);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    try {
      const response = await fetch('/api/ai/chat/google/key', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete API key');
      }

      form.reset({ apiKey: '' });
      setValidated(false);
      toast({
        title: t('api-key-deleted-title'),
        description: t('api-key-deleted-desc'),
      });

      router.refresh();
    } catch (error) {
      toast({
        title: t('api-key-invalid-title'),
        description: t('api-key-invalid-desc'),
        variant: 'destructive',
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSave)} className="grid gap-4">
        <div className="flex flex-col gap-2">
          <FormField
            control={form.control}
            name="apiKey"
            render={({ field }) => (
              <FormItem className="w-full md:min-w-max md:max-w-lg">
                <div className="relative">
                  <FormControl>
                    <Input
                      id="apiKey"
                      placeholder={t('enter-api-key')}
                      type={showApiKey ? 'text' : 'password'}
                      {...field}
                    />
                  </FormControl>
                  <button
                    tabIndex={-1}
                    type="button"
                    className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {!validated && (
            <Button type="submit" size="default" disabled={!apiKey || saving}>
              {saving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Check className="h-5 w-5" />
              )}
              <span className="ml-2">{t('validate')}</span>
            </Button>
          )}

          {validated && (
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              size="default"
            >
              {t('delete-api-key')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
