import { DateTimePicker } from './DateTimePicker';
import { DurationDisplay } from './DurationDisplay';
import { Badge } from '@tuturuuu/ui/badge';
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
import {
  CalendarIcon,
  Eye,
  EyeOff,
  InfoIcon,
  ListChecks,
  Lock,
  PlusCircle,
  TimerIcon,
  Trash2,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useState } from 'react';
import * as z from 'zod';

const criteriaSchema = z.object({
  id: z.string().nullable(),
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  description: z.string().min(10, {
    message: 'Description must be at least 10 characters.',
  }),
});

const formSchema = z
  .object({
    title: z.string().min(3, {
      message: 'Title must be at least 3 characters.',
    }),
    description: z.string().min(10, {
      message: 'Description must be at least 10 characters.',
    }),
    criteria: z.array(criteriaSchema),
    duration: z.coerce.number().min(60, {
      message: 'Duration must be at least 60 seconds.',
    }),
    enabled: z.boolean().default(false),
    maxAttempts: z.number().min(1, {
      message: 'Max attempts must be at least 1.',
    }),
    maxDailyAttempts: z.number().min(1, {
      message: 'Max daily attempts must be at least 1.',
    }),
    password: z
      .string()
      .min(6, { message: 'Password must be at least 6 characters.' })
      .nullable(),
    openAt: z.date().nullable(),
    closeAt: z.date().nullable(),
    previewableAt: z.date().nullable(),
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
  defaultValues,
  challengeId,
  onSubmit,
  isSubmitting,
}: ChallengeFormProps) {
  const isEditing = !!challengeId;

  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<ChallengeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      criteria: [],
      duration: 3600,
      enabled: false,
      maxAttempts: 1,
      maxDailyAttempts: 1,
      password: null,
      openAt: null,
      closeAt: null,
      previewableAt: null,
      ...defaultValues,
    },
  });

  const addCriteria = () => {
    const currentCriteria = form.getValues('criteria');
    form.setValue('criteria', [
      ...currentCriteria,
      { id: null, name: '', description: '' },
    ]);
  };

  const removeCriteria = (index: number) => {
    const currentCriteria = form.getValues('criteria');
    const updatedCriteria = currentCriteria.filter((_, i) => i !== index);
    form.setValue('criteria', updatedCriteria);
  };

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
            <TabsTrigger value="security">
              <Lock className="h-4 w-4" />
              <span>Security</span>
            </TabsTrigger>
            <TabsTrigger value="duration">
              <TimerIcon className="h-4 w-4" />
              <span>Duration</span>
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <CalendarIcon className="h-4 w-4" />
              <span>Schedule</span>
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
                        <FormMessage className="text-xs" />
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
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enabled</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormDescription>
                          Whether this challenge is currently active.
                        </FormDescription>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="criteria" className="mt-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle>Judging Criteria</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Define how submissions will be evaluated. Each criterion
                      will be scored separately.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addCriteria()}
                    className="h-8 gap-1"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Add Criteria</span>
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {form.watch('criteria')?.length > 0 ? (
                      form.watch('criteria')?.map((criterion, index) => (
                        <Card
                          key={criterion.id || index}
                          className="border-dashed"
                        >
                          <CardContent className="p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium">
                                  Criteria {index + 1}
                                </h4>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge
                                        variant="outline"
                                        className="cursor-help"
                                      >
                                        {form.watch(`criteria.${index}.name`) ||
                                          'Unnamed'}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="max-w-xs">
                                        {form.watch(
                                          `criteria.${index}.description`
                                        ) || 'No description yet'}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive/80"
                                onClick={() => removeCriteria(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Remove</span>
                              </Button>
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
                                        placeholder="Criteria name (e.g., Clarity, Efficiency)"
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
                                        placeholder="Explain how this criteria will be judged (e.g., 'How clear and unambiguous is the prompt?')"
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
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No criteria yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Security</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">
                          Password Protection
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Require a password to access this challenge
                        </div>
                      </div>
                      <Switch
                        checked={form.watch('password') !== null}
                        onCheckedChange={(checked) => {
                          form.setValue('password', checked ? '' : null);
                        }}
                      />
                    </div>

                    {form.watch('password') !== null && (
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Challenge Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? 'text' : 'password'}
                                  placeholder="Enter password"
                                  {...field}
                                  value={field.value || ''}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute top-0 right-0 h-full px-3"
                                  onClick={() => setShowPassword(!showPassword)}
                                >
                                  {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </FormControl>
                            <FormDescription>
                              Must be at least 6 characters
                            </FormDescription>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="duration" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Challenge Duration</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Set how long participants have to complete the challenge
                    once they start.
                  </p>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (seconds)</FormLabel>
                        <div className="flex flex-col gap-4">
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>

                          <div className="flex flex-col gap-2">
                            <div className="text-sm font-medium">
                              Common durations:
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => form.setValue('duration', 1800)}
                              >
                                30 minutes
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => form.setValue('duration', 3600)}
                              >
                                1 hour
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => form.setValue('duration', 7200)}
                              >
                                2 hours
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => form.setValue('duration', 14400)}
                              >
                                4 hours
                              </Button>
                            </div>
                          </div>
                        </div>

                        {field.value && (
                          <div className="mt-4 rounded-md border bg-muted/30 p-3">
                            <DurationDisplay seconds={field.value} />
                          </div>
                        )}

                        <FormDescription>
                          How long users have to complete this challenge once
                          they start it.
                        </FormDescription>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <div className="mt-6 space-y-4">
                    <h3 className="font-medium">Attempt Limits</h3>

                    <FormField
                      control={form.control}
                      name="maxAttempts"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Attempts</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              value={field.value || 1}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 1)
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Total number of times a user can attempt this
                            challenge.
                          </FormDescription>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="maxDailyAttempts"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Daily Attempts</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              value={field.value || 1}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 1)
                              }
                            />
                          </FormControl>
                          <FormDescription>
                            Number of times a user can attempt this challenge
                            per day.
                          </FormDescription>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="schedule" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Challenge Schedule</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Set when your challenge is available to participants.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="mb-6 rounded-md border border-dashed p-4">
                    <div className="mb-2 flex items-center">
                      <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium">
                        Timeline Recommendation
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      For best results, set dates in this order: Preview Date ➝
                      Open Date ➝ Close Date.
                    </p>
                  </div>

                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="previewableAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preview Available</FormLabel>
                          <FormControl>
                            <DateTimePicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormDescription>
                            When participants can preview this challenge before
                            it starts.
                          </FormDescription>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="openAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opens At</FormLabel>
                          <FormControl>
                            <DateTimePicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormDescription>
                            When the challenge starts
                          </FormDescription>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="closeAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Closes At</FormLabel>
                          <FormControl>
                            <DateTimePicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormDescription>
                            When the challenge closes
                          </FormDescription>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>
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
