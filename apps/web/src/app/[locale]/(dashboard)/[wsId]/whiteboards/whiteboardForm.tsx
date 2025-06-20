'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import * as z from 'zod';

const formSchema = z.object({
  title: z.string().min(3, {
    message: 'Title must be at least 3 characters.',
  }),
  description: z.string().optional(),
});

export type WhiteboardFormValues = z.infer<typeof formSchema>;

interface WhiteboardFormProps {
  defaultValues?: WhiteboardFormValues;
  whiteboardId?: string;
  onSubmit: (values: WhiteboardFormValues) => void;
  isSubmitting: boolean;
}

export default function WhiteboardForm({
  defaultValues,
  whiteboardId,
  onSubmit,
  isSubmitting,
}: WhiteboardFormProps) {
  const isEditing = !!whiteboardId;

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {isEditing ? 'Edit Whiteboard' : 'Create Whiteboard'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter whiteboard title" {...field} />
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
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter whiteboard description"
                      className="min-h-24"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? isEditing
                ? 'Updating...'
                : 'Creating...'
              : isEditing
                ? 'Update Whiteboard'
                : 'Create Whiteboard'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
