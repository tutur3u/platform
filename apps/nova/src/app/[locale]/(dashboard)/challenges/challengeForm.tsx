'use client';

import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  InfoIcon,
  ListChecks,
  PlusCircle,
  TimerIcon,
  Trash2,
} from 'lucide-react';
import * as z from 'zod';

const formSchema = z
  .object({
    title: z.string().min(3, {
      message: 'Title must be at least 3 characters.',
    }),
    description: z.string().min(10, {
      message: 'Description must be at least 10 characters.',
    }),
    criteria: z
      .array(
        z.object({
          name: z
            .string()
            .min(2, { message: 'Name must be at least 2 characters.' }),
          description: z.string().min(10, {
            message: 'Description must be at least 10 characters.',
          }),
        })
      )
      .min(1, { message: 'At least one criteria is required' }),
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
    criteria: [{ name: '', description: '' }],
    duration: 3600,
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="mb-4 justify-start">
            <TabsTrigger value="details">
              <InfoIcon className="h-4 w-4" />
              <span>Details</span>
            </TabsTrigger>
            <TabsTrigger value="criteria">
              <ListChecks className="h-4 w-4" />
              <span>Judging Criteria</span>
            </TabsTrigger>
            <TabsTrigger value="duration">
              <TimerIcon className="h-4 w-4" />
              <span>Duration</span>
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px]">
            <TabsContent value="details" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Challenge Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                            className="min-h-32 resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Provide a short description of what this challenge is
                          about.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="criteria" className="mt-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle>Judging Criteria</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const currentCriteria = form.getValues('criteria') || [];
                      form.setValue('criteria', [
                        ...currentCriteria,
                        { name: '', description: '' },
                      ]);
                    }}
                    className="h-8 gap-1"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Add Criteria</span>
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {form.watch('criteria')?.map((_, index) => (
                      <Card key={index} className="border-dashed">
                        <CardContent className="p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-sm font-medium">
                              Criteria {index + 1}
                            </h4>
                            {index > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive/80"
                                onClick={() => {
                                  const currentCriteria =
                                    form.getValues('criteria');
                                  form.setValue(
                                    'criteria',
                                    currentCriteria.filter(
                                      (_, i) => i !== index
                                    )
                                  );
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Remove</span>
                              </Button>
                            )}
                          </div>
                          <div className="space-y-3">
                            <FormField
                              control={form.control}
                              name={`criteria.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">
                                    Name
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="Criteria name"
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
                                <FormItem>
                                  <FormLabel className="text-xs">
                                    Description
                                  </FormLabel>
                                  <FormControl>
                                    <Textarea
                                      className="min-h-24 resize-none"
                                      placeholder="Explain how this criteria will be judged"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="duration" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Duration</CardTitle>
                </CardHeader>
                <CardContent>
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
                          How long users have to complete this challenge (in
                          seconds).
                          <div className="mt-1 text-xs text-muted-foreground">
                            Examples: 3600 = 1 hour, 1800 = 30 minutes
                          </div>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="px-6">
            {isEditing ? 'Update Challenge' : 'Create Challenge'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
