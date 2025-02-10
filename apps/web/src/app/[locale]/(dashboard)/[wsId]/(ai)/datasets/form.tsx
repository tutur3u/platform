'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { WorkspaceDataset } from '@tutur3u/types/db';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tutur3u/ui/components/ui/form';
import { Input } from '@tutur3u/ui/components/ui/input';
import { ScrollArea } from '@tutur3u/ui/components/ui/scroll-area';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { Textarea } from '@tutur3u/ui/components/ui/textarea';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
});

interface Props {
  wsId: string;
  data?: WorkspaceDataset;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

export default function DatasetForm({ wsId, data, onFinish }: Props) {
  const router = useRouter();

  const [saving, setSaving] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      description: data?.description || '',
    },
  });

  const onSubmit = async (formData: z.infer<typeof FormSchema>) => {
    setSaving(true);
    try {
      const res = await fetch(
        formData.id
          ? `/api/v1/workspaces/${wsId}/datasets/${formData.id}`
          : `/api/v1/workspaces/${wsId}/datasets`,
        {
          method: formData.id ? 'PUT' : 'POST',
          body: JSON.stringify(formData),
        }
      );

      if (res.ok) {
        onFinish?.(formData);
        router.refresh();
      } else {
        const resData = await res.json();
        toast({
          title: `Failed to ${formData.id ? 'edit' : 'create'} user`,
          description: resData.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${formData.id ? 'edit' : 'create'} user`,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
          <ScrollArea className="max-h-96">
            <div className="grid gap-2">
              {data?.id && (
                <>
                  <FormField
                    control={form.control}
                    name="id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dataset ID</FormLabel>
                        <FormControl>
                          <Input {...field} disabled />
                        </FormControl>
                        <FormMessage />
                        <FormDescription>
                          The identification number of this user in your
                          workspace. This is automatically managed by Tuturuuu,
                          and cannot be changed.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  <Separator />
                </>
              )}

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Empty" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </ScrollArea>

          <div className="flex justify-center gap-2">
            <Button type="submit" className="w-full" disabled={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
