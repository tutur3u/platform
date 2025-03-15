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
    criteria: z.array(z.object({
      name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
      description: z.string().min(10, { message: 'Description must be at least 10 characters.' }),
      score: z.coerce.number().min(1, { message: 'Score must be at least 1.' }).max(100, { message: 'Score cannot exceed 100.' }),
    })).min(1, { message: 'At least one criteria is required' }),
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
    criteria: [{ name: '', description: '', score: 10 }],
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
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-medium">Judging Criteria</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const currentCriteria = form.getValues('criteria') || [];
                form.setValue('criteria', [
                  ...currentCriteria,
                  { name: '', description: '', score: 10 },
                ]);
              }}
            >
              Add Criteria
            </Button>
          </div>

          {form.watch('criteria')?.map((_, index) => (
            <div key={index} className="flex items-center gap-2 rounded-lg border p-2">
              <FormField
                control={form.control}
                name={`criteria.${index}.name`}
                render={({ field }) => (
                  <FormItem className="w-[120px] space-y-0">
                    <FormControl>
                      <Input 
                        className="h-8" 
                        placeholder="Name" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`criteria.${index}.description`}
                render={({ field }) => (
                  <FormItem className="flex-1 space-y-0">
                    <FormControl>
                      <Input 
                        className="h-8" 
                        placeholder="Description" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={`criteria.${index}.score`}
                render={({ field }) => (
                  <FormItem className="w-[80px] space-y-0">
                    <FormControl>
                      <Input 
                        className="h-8" 
                        type="number" 
                        min="1" 
                        max="100" 
                        placeholder="Score"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {index > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    const currentCriteria = form.getValues('criteria');
                    form.setValue(
                      'criteria',
                      currentCriteria.filter((_, i) => i !== index)
                    );
                  }}
                >
                  ×
                </Button>
              )}
            </div>
          ))}
        </div>
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
