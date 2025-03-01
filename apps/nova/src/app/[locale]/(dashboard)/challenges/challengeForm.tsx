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
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import * as z from 'zod';

const formSchema = z.object({
  title: z.string().min(3, {
    message: 'Title must be at least 3 characters.',
  }),
  description: z.string().min(10, {
    message: 'Description must be at least 10 characters.',
  }),
  duration: z.coerce.number().min(1, {
    message: 'Duration must be at least 1 minute.',
  }),
});

type ChallengeFormValues = z.infer<typeof formSchema>;

interface ChallengeFormProps {
  defaultValues?: Partial<ChallengeFormValues>;
  challengeId?: string;
  onSuccess?: () => void;
}

export default function ChallengeForm({
  defaultValues = {
    title: '',
    description: '',
    duration: 60,
  },
  challengeId,
  onSuccess,
}: ChallengeFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const isEditing = !!challengeId;

  const form = useForm<ChallengeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  async function onSubmit(values: ChallengeFormValues) {
    try {
      const url = isEditing
        ? `/api/v1/challenges/${challengeId}`
        : '/api/v1/challenges';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to save challenge');
      }

      toast({
        title: `Challenge ${isEditing ? 'updated' : 'created'} successfully`,
        variant: 'default',
      });

      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Error saving challenge:', error);
      toast({
        title: 'Failed to save challenge',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }

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
          name="duration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Duration (minutes)</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormDescription>
                How long users have to complete this challenge.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit">
            {isEditing ? 'Update Challenge' : 'Create Challenge'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
