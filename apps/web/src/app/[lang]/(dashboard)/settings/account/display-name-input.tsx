'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  defaultValue?: string;
}

const FormSchema = z.object({
  name: z.string().min(1).max(50),
});

export default function DisplayNameInput({ defaultValue = '' }: Props) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: defaultValue,
    },
  });

  const name = form.watch('name');

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setSaving(true);

    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ display_name: data.name }),
    });

    if (res.ok) {
      toast({
        title: 'Profile updated',
        description: 'Your display name has been updated.',
      });

      router.refresh();
    } else {
      toast({
        title: 'An error occurred',
        description: 'Please try again.',
      });
    }

    setSaving(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <div className="flex items-start gap-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Input
                    id="display-name"
                    placeholder="Display name"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="icon"
            onClick={form.handleSubmit(onSubmit)}
            disabled={!name || name === defaultValue || saving}
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
