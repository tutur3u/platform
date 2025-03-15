'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
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

const formSchema = z
  .object({
    title: z.string().min(3, {
      message: 'Title must be at least 3 characters.',
    }),
    description: z.string().min(10, {
      message: 'Description must be at least 10 characters.',
    }),
    criteria: z.string().min(10, {
      message: 'Criteria must be at least 10 characters.',
    }),
    duration: z.coerce.number().min(60, {
      message: 'Duration must be at least 60 seconds.',
    }),
  })
  .required();

export type ChallengeFormValues = z.infer<typeof formSchema>;

interface ChallengeFormProps {
  defaultValues?: Partial<ChallengeFormValues>;
  challengeId?: string;
  onSubmit: (values: ChallengeFormValues) => void;
  isSubmitting: boolean;
}

export default function ChallengeForm({
  defaultValues = {
    title: '',
    description: '',
    criteria: '',
    duration: 3600, // Default to 1 hour in seconds
  },
  challengeId,
  onSubmit,
  isSubmitting,
}: ChallengeFormProps) {
  const isEditing = !!challengeId;

  const form = useForm<ChallengeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Challenge title" {...field} />
              </FormControl>
              <FormDescription>
                Give your challenge a descriptive title.
              </FormDescription>
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
                <Textarea
                  placeholder="A brief description of the challenge"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Provide a short description of what this challenge is about.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="criteria"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Judging Criteria</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="List the criteria for judging submissions"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Specify the criteria that will be used to evaluate challenge submissions.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (seconds)</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormDescription>
                How long users have to complete this challenge (in seconds). For
                example: 3600 = 1 hour, 1800 = 30 minutes.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isEditing ? 'Update Challenge' : 'Create Challenge'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
