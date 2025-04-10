'use client';

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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: Partial<{
    id: string;
    name: string;
    location: string;
    building_requirements: string;
  }>;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
  building_requirements: z
    .string()
    .min(1, 'Building requirements are required'),
});

export default function ArchitectureForm({ wsId, data, onFinish }: Props) {
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      location: data?.location || '',
      building_requirements: data?.building_requirements || '',
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/architecture/${data.id}`
          : `/api/v1/workspaces/${wsId}/architecture`,
        {
          method: data.id ? 'PUT' : 'POST',
          body: JSON.stringify(data),
        }
      );

      if (res.ok) {
        const json = await res.json();

        toast({
          title: 'Success',
          description: `Project ${data.id ? 'updated' : 'created'} successfully`,
        });

        onFinish?.(data);
        router.refresh();
      } else {
        const errorData = await res.json();
        toast({
          title: `Failed to ${data.id ? 'update' : 'create'} project`,
          description: errorData.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'update' : 'create'} project`,
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="New Office Building"
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. San Francisco, CA, USA"
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="building_requirements"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Building Requirements</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe your building requirements (e.g. 5-story office building, 10,000 sq ft residential complex, etc.)"
                  rows={5}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? 'Update Project' : 'Create Project'}
        </Button>
      </form>
    </Form>
  );
}
