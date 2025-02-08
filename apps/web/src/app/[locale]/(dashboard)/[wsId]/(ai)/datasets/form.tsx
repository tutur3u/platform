'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { WorkspaceDataset } from '@repo/types/db';
import { Button } from '@repo/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { ScrollArea } from '@repo/ui/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { Separator } from '@repo/ui/components/ui/separator';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { toast } from '@repo/ui/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  url: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['excel', 'csv', 'html']).default('excel'),
  html_ids: z.array(z.string()).optional(),
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
      url: data?.url || '',
      description: data?.description || '',
      type: (data?.type as 'excel' | 'csv' | 'html') || 'excel',
      html_ids: data?.html_ids || [],
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
          body: JSON.stringify({
            ...formData,
            html_ids:
              formData.type === 'html'
                ? formData.html_ids?.filter((id) => id && id.trim() !== '')
                : null,
          }),
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
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com" {...field} />
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

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excel">Excel</SelectItem>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="html">HTML</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch('type') === 'html' && (
                <FormField
                  control={form.control}
                  name="html_ids"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HTML IDs</FormLabel>
                      <div className="space-y-2">
                        {field.value?.map((id, index) => (
                          <div key={index} className="flex gap-2">
                            <FormControl>
                              <Input
                                value={id}
                                onChange={(e) => {
                                  const newIds = [...(field.value || [])];
                                  newIds[index] = e.target.value;
                                  field.onChange(newIds);
                                }}
                                placeholder="Enter HTML ID"
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                const newIds = field.value?.filter(
                                  (_, i) => i !== index
                                );
                                field.onChange(newIds);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            const newIds = [...(field.value || []), ''];
                            field.onChange(newIds);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add HTML ID
                        </Button>
                      </div>
                      <FormDescription>
                        Add HTML IDs that will be used to extract data from the
                        HTML page.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </ScrollArea>

          <Separator className="my-2" />

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
