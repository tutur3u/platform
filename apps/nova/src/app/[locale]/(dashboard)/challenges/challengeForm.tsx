import { DateTimePicker } from './DateTimePicker';
import { DurationDisplay } from './DurationDisplay';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
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
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useRef, useState } from 'react';
import * as z from 'zod';

const criteriaSchema = z.object({
  id: z.string().nullable(),
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  description: z.string().min(10, {
    message: 'Description must be at least 10 characters.',
  }),
});

const emailSchema = z.string().email({ message: 'Invalid email address' });

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
    whitelistedOnly: z.boolean().default(false),
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
    whitelistedEmails: z.array(emailSchema),
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
  const emailInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ChallengeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      criteria: [],
      duration: 3600,
      enabled: false,
      whitelistedOnly: false,
      maxAttempts: 1,
      maxDailyAttempts: 1,
      password: null,
      openAt: null,
      closeAt: null,
      previewableAt: null,
      whitelistedEmails: [],
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

  const addEmailToWhitelist = () => {
    try {
      const newEmail = emailInputRef.current?.value;
      if (!newEmail) {
        form.setError('whitelistedEmails', {
          message: 'Email is required',
        });
        return;
      }

      // Use Zod to validate the email
      emailSchema.parse(newEmail);

      const currentEmails = form.getValues('whitelistedEmails');

      // Check for duplicates
      if (!currentEmails.includes(newEmail)) {
        form.setValue('whitelistedEmails', [...currentEmails, newEmail]);
      }

      if (emailInputRef.current) {
        emailInputRef.current.value = '';
      }

      form.clearErrors('whitelistedEmails');
    } catch (error) {
      // Email validation failed
      form.setError('whitelistedEmails', {
        message: 'Invalid email address',
      });
    }
  };

  const removeEmailFromWhitelist = (index: number) => {
    const currentEmails = form.getValues('whitelistedEmails');
    const updatedEmails = [...currentEmails];
    updatedEmails.splice(index, 1);
    form.setValue('whitelistedEmails', updatedEmails);
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

            <TabsContent value="criteria" className="mt-0">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex flex-col gap-1">
                    <CardTitle>Judging Criteria</CardTitle>
                    <CardDescription className="text-muted-foreground text-sm">
                      Define how submissions will be evaluated. Each criterion
                      will be scored separately.
                    </CardDescription>
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
                                className="text-destructive hover:text-destructive/80 h-8 w-8 p-0"
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
                      <p className="text-muted-foreground text-sm">
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
                  <CardTitle>Challenge Security</CardTitle>
                  <CardDescription className="text-muted-foreground text-sm">
                    Secure your challenge with a password or restrict access to
                    specific users.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4 rounded-lg border p-4">
                    <div className="flex flex-row items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium">
                          Password Protection
                        </div>
                        <div className="text-muted-foreground text-sm">
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
                      <>
                        <Separator className="mx-auto my-6 max-w-md" />
                        <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Challenge Password</FormLabel>

                              <div className="relative">
                                <FormControl>
                                  <Input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Enter password"
                                    {...field}
                                    value={field.value || ''}
                                  />
                                </FormControl>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-0 top-0 h-full px-3"
                                  onClick={() => setShowPassword(!showPassword)}
                                >
                                  {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>

                              <FormDescription>
                                Must be at least 6 characters
                              </FormDescription>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>

                  <div className="space-y-4 rounded-lg border p-4">
                    <FormField
                      control={form.control}
                      name="enabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between">
                          <div className="space-y-0.5">
                            <FormLabel>Enabled</FormLabel>
                            <FormDescription>
                              Whether this challenge is currently enabled.
                            </FormDescription>
                          </div>

                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="whitelistedOnly"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between">
                          <div className="space-y-0.5">
                            <FormLabel>Whitelisted Only</FormLabel>
                            <FormDescription>
                              Restrict access to only whitelisted users.
                            </FormDescription>
                          </div>

                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {form.watch('whitelistedOnly') && (
                      <>
                        <Separator className="mx-auto my-6 max-w-md" />
                        <FormField
                          control={form.control}
                          name="whitelistedEmails"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Whitelisted Email Addresses</FormLabel>
                              <FormDescription>
                                Only these email addresses will have access to
                                the challenge.
                              </FormDescription>
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  {field.value.map((email, index) => (
                                    <Badge
                                      key={index}
                                      variant="secondary"
                                      className="flex items-center gap-1 py-1"
                                    >
                                      {email}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="ml-1 h-4 w-4 p-0"
                                        onClick={() =>
                                          removeEmailFromWhitelist(index)
                                        }
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        <span className="sr-only">Remove</span>
                                      </Button>
                                    </Badge>
                                  ))}
                                </div>

                                <div className="flex gap-2">
                                  <FormControl>
                                    <Input
                                      ref={emailInputRef}
                                      placeholder="Enter email address"
                                    />
                                  </FormControl>
                                  <Button
                                    type="button"
                                    onClick={addEmailToWhitelist}
                                  >
                                    Add
                                  </Button>
                                </div>
                              </div>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="duration" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Challenge Duration</CardTitle>
                  <CardDescription className="text-muted-foreground text-sm">
                    Set how long participants have to complete the challenge
                    once they start.
                  </CardDescription>
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
                          <div className="bg-muted/30 mt-4 rounded-md border p-3">
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="schedule" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Challenge Schedule</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    Set when your challenge is available to participants.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="mb-6 rounded-md border border-dashed p-4">
                    <div className="mb-2 flex items-center">
                      <CalendarIcon className="text-muted-foreground mr-2 h-4 w-4" />
                      <h3 className="text-sm font-medium">
                        Timeline Recommendation
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-xs">
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
