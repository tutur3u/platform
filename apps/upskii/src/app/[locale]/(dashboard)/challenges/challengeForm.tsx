import { DateTimePicker } from './DateTimePicker';
import { DurationDisplay } from './DurationDisplay';
import { fetchAdmins } from './actions';
import { useQuery } from '@tanstack/react-query';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@tuturuuu/ui/command';
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
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  InfoIcon,
  ListChecks,
  Lock,
  PlusCircle,
  TimerIcon,
  Trash2,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
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
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
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

const formSchema = z.object({
  title: z.string().min(3, {
    message: 'Title must be at least 3 characters.',
  }),
  description: z.string().min(10, {
    message: 'Description must be at least 10 characters.',
  }),
  maxAttempts: z.number().min(1, {
    message: 'Max attempts must be at least 1.',
  }),
  maxDailyAttempts: z.number().min(1, {
    message: 'Max daily attempts must be at least 1.',
  }),
  criteria: z.array(criteriaSchema),
  duration: z.coerce.number().min(60, {
    message: 'Duration must be at least 60 seconds.',
  }),
  enablePassword: z.boolean().default(false),
  password: z.string().optional(),
  enabled: z.boolean().default(false),
  whitelistedOnly: z.boolean().default(false),
  whitelistedEmails: z.array(emailSchema),
  managingAdmins: z.array(emailSchema),
  openAt: z.date().nullable(),
  closeAt: z.date().nullable(),
  previewableAt: z.date().nullable(),
});

export type ChallengeFormValues = z.infer<typeof formSchema>;

interface ChallengeFormProps {
  defaultValues?: ChallengeFormValues;
  challengeId?: string;
  onSubmit: (values: ChallengeFormValues) => void;
  isSubmitting: boolean;
}

export type AdminsResponse = {
  admins: string[];
  error?: string;
};

export default function ChallengeForm({
  defaultValues,
  challengeId,
  onSubmit,
  isSubmitting,
}: ChallengeFormProps) {
  const isEditing = !!challengeId;

  const [showPassword, setShowPassword] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [adminSearchTerm, setAdminSearchTerm] = useState('');

  const t = useTranslations('nova.challenge');

  const form = useForm<ChallengeFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      maxAttempts: 1,
      maxDailyAttempts: 1,
      criteria: [],
      duration: 3600,
      enablePassword: false,
      password: '',
      enabled: false,
      whitelistedOnly: false,
      whitelistedEmails: [],
      managingAdmins: [],
      openAt: null,
      closeAt: null,
      previewableAt: null,
      ...defaultValues,
    },
  });

  const { data: adminsData = { admins: [] }, isLoading: isLoadingAdmins } =
    useQuery<AdminsResponse, Error, AdminsResponse>({
      queryKey: ['admins'],
      queryFn: fetchAdmins,
      refetchOnWindowFocus: true,
      refetchInterval: 60000, // Refetch every minute
    });

  const admins = adminsData.admins;

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

  const removeAdmin = (index: number) => {
    const currentAdmins = form.getValues('managingAdmins');
    const updatedAdmins = [...currentAdmins];
    updatedAdmins.splice(index, 1);
    form.setValue('managingAdmins', updatedAdmins);
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
              <span>{t('details.details')}</span>
            </TabsTrigger>
            <TabsTrigger value="criteria">
              <ListChecks className="h-4 w-4" />
              <span>{t('judging-criteria.judging-criteria')}</span>
            </TabsTrigger>
            <TabsTrigger value="security">
              <Lock className="h-4 w-4" />
              <span>{t('security.security')}</span>
            </TabsTrigger>
            <TabsTrigger value="duration">
              <TimerIcon className="h-4 w-4" />
              <span>{t('duration.duration')}</span>
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <CalendarIcon className="h-4 w-4" />
              <span>{t('schedule.schedule')}</span>
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px]">
            <TabsContent value="details" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>{t('details.challenge-details')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('details.title')}</FormLabel>
                        <FormControl>
                          <Input placeholder="Challenge title" {...field} />
                        </FormControl>
                        <FormDescription>
                          {t('details.title-description')}
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
                        <FormLabel> {t('details.description')}</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t('details.description-placeholder')}
                            className="min-h-32 resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('details.form-description')}
                        </FormDescription>
                        <FormMessage className="text-xs" />
                      </FormItem>
                    )}
                  />

                  <div className="mt-6 space-y-4">
                    <h3 className="font-medium">{t('limits')}</h3>

                    <FormField
                      control={form.control}
                      name="maxAttempts"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('max-attempts')}</FormLabel>
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
                            {t('attempt-description')}
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
                          <FormLabel> {t('daily-attempts')}</FormLabel>
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
                            {t('number-of-attempts')}
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
                    <CardTitle>
                      {t('judging-criteria.judging-criteria')}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-sm">
                      {t('judging-criteria.judging-criteria-description')}
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
                    <span>{t('judging-criteria.add-criteria')}</span>
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
                                  {t('judging-criteria.criteria')} {index + 1}
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
                                <span className="sr-only">
                                  {t('judging-criteria.remove-criteria')}
                                </span>
                              </Button>
                            </div>
                            <div className="space-y-3">
                              <FormField
                                control={form.control}
                                name={`criteria.${index}.name`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">
                                      {t('judging-criteria.criteria-name')}
                                    </FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder={t(
                                          'judging-criteria.criteria-name-placeholder'
                                        )}
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
                                      {t(
                                        'judging-criteria.criteria-description'
                                      )}
                                    </FormLabel>
                                    <FormControl>
                                      <Textarea
                                        className="min-h-24 resize-none"
                                        placeholder={t(
                                          'judging-criteria.criteria-description-placeholder'
                                        )}
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
                        {t('judging-criteria.no-criteria')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>{t('security.security')}</CardTitle>
                  <CardDescription className="text-muted-foreground text-sm">
                    {t('security.security-description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4 rounded-lg border p-4">
                    <FormField
                      control={form.control}
                      name="enablePassword"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between">
                          <div className="space-y-0.5">
                            <FormLabel>
                              {' '}
                              {t('security.password-protect')}{' '}
                            </FormLabel>
                            <FormDescription>
                              {t('security.password-description')}
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

                    {form.watch('enablePassword') && (
                      <>
                        <Separator className="mx-auto my-6 max-w-md" />
                        <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {t('security.challenge-password')}
                              </FormLabel>

                              <div className="relative">
                                <FormControl>
                                  <Input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder={
                                      isEditing
                                        ? t('security.leave-empty')
                                        : t('security.enter-password')
                                    }
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
                                {isEditing
                                  ? t('security.enter-or-leave-password')
                                  : t('security.must-be-6-characters')}
                              </FormDescription>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>

                  <div className="mt-4 space-y-4 rounded-lg border p-4">
                    <h3 className="text-base font-medium">
                      Challenge Administration
                    </h3>
                    <FormField
                      control={form.control}
                      name="managingAdmins"
                      render={({ field }) => (
                        <FormItem className="space-y-4">
                          <FormLabel>Managing Administrators</FormLabel>
                          <FormDescription>
                            Specify which administrators can manage this
                            challenge.
                          </FormDescription>

                          <div className="space-y-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      'w-full justify-between',
                                      !field.value?.length &&
                                        'text-muted-foreground'
                                    )}
                                  >
                                    {isLoadingAdmins
                                      ? 'Loading admins...'
                                      : field.value?.length > 0
                                        ? `${field.value.length} admin${field.value.length > 1 ? 's' : ''} selected`
                                        : 'Select administrators'}
                                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>

                              <PopoverContent
                                className="w-full p-0"
                                align="start"
                              >
                                <Command>
                                  <CommandInput
                                    placeholder="Search administrators..."
                                    value={adminSearchTerm}
                                    onValueChange={setAdminSearchTerm}
                                  />

                                  {isLoadingAdmins ? (
                                    <div className="p-4 text-center text-sm">
                                      Loading administrators...
                                    </div>
                                  ) : (
                                    <>
                                      <CommandEmpty>
                                        No administrators found.
                                      </CommandEmpty>
                                      <CommandGroup className="max-h-64 overflow-auto">
                                        {admins
                                          ?.filter((adminEmail) =>
                                            adminEmail
                                              .toLowerCase()
                                              .includes(
                                                adminSearchTerm.toLowerCase()
                                              )
                                          )
                                          .map((adminEmail) => (
                                            <CommandItem
                                              key={adminEmail}
                                              value={adminEmail}
                                              onSelect={() => {
                                                const currentAdmins = [
                                                  ...field.value,
                                                ];
                                                const adminIndex =
                                                  currentAdmins.indexOf(
                                                    adminEmail
                                                  );

                                                if (adminIndex !== -1) {
                                                  currentAdmins.splice(
                                                    adminIndex,
                                                    1
                                                  );
                                                } else {
                                                  currentAdmins.push(
                                                    adminEmail
                                                  );
                                                }

                                                form.setValue(
                                                  'managingAdmins',
                                                  currentAdmins
                                                );
                                              }}
                                            >
                                              <Check
                                                className={cn(
                                                  'mr-2 h-4 w-4',
                                                  field.value?.includes(
                                                    adminEmail
                                                  )
                                                    ? 'opacity-100'
                                                    : 'opacity-0'
                                                )}
                                              />
                                              <div className="flex flex-col">
                                                <span>{adminEmail}</span>
                                              </div>
                                            </CommandItem>
                                          ))}
                                      </CommandGroup>
                                    </>
                                  )}
                                </Command>
                              </PopoverContent>
                            </Popover>

                            {field.value?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {field.value.map((adminEmail, index) => (
                                  <Badge
                                    key={index}
                                    variant="secondary"
                                    className="flex items-center gap-1 py-1"
                                  >
                                    {adminEmail}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="ml-1 h-4 w-4 p-0"
                                      onClick={() => removeAdmin(index)}
                                    >
                                      <X className="h-3 w-3" />
                                      <span className="sr-only">Remove</span>
                                    </Button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>

                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4 rounded-lg border p-4">
                    <FormField
                      control={form.control}
                      name="enabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between">
                          <div className="space-y-0.5">
                            <FormLabel>{t('security.enable')}</FormLabel>
                            <FormDescription>
                              {t('security.enable-description')}
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
                            <FormLabel> {t('whitelist.only')} </FormLabel>
                            <FormDescription>
                              {t('whitelist.whitelist-only-description')}
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
                              <FormLabel> {t('whitelist.emails')} </FormLabel>
                              <FormDescription>
                                {t('whitelist.emails-description')}
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
                                        <span className="sr-only">
                                          {t('whitelist.remove')}
                                        </span>
                                      </Button>
                                    </Badge>
                                  ))}
                                </div>

                                <div className="flex gap-2">
                                  <FormControl>
                                    <Input
                                      ref={emailInputRef}
                                      placeholder={t(
                                        'whitelist.email-enter-placeholder'
                                      )}
                                    />
                                  </FormControl>
                                  <Button
                                    type="button"
                                    onClick={addEmailToWhitelist}
                                  >
                                    {t('whitelist.add')}
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
                  <CardTitle>{t('duration.duration')}</CardTitle>
                  <CardDescription className="text-muted-foreground text-sm">
                    {t('duration.duration-description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('duration.seconds')}</FormLabel>
                        <div className="flex flex-col gap-4">
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>

                          <div className="flex flex-col gap-2">
                            <div className="text-sm font-medium">
                              {t('duration.common-duration')}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => form.setValue('duration', 1800)}
                              >
                                {t('duration.30-minutes')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => form.setValue('duration', 3600)}
                              >
                                {t('duration.1-hour')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => form.setValue('duration', 7200)}
                              >
                                {t('duration.2-hour')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => form.setValue('duration', 14400)}
                              >
                                {t('duration.4-hour')}
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
                          {t('duration.duration-display-description')}
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
                  <CardTitle>{t('schedule.schedule')}</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    {t('schedule.schedule-description')}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="mb-6 rounded-md border border-dashed p-4">
                    <div className="mb-2 flex items-center">
                      <CalendarIcon className="text-muted-foreground mr-2 h-4 w-4" />
                      <h3 className="text-sm font-medium">
                        {t('schedule.timeline-recommendation')}
                      </h3>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {t('schedule.timeline-recommendation-description')}
                    </p>
                  </div>

                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="previewableAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {' '}
                            {t('schedule.preview-available')}{' '}
                          </FormLabel>
                          <FormControl>
                            <DateTimePicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('schedule.preview-available-description')}
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
                          <FormLabel>{t('schedule.open-at')}</FormLabel>
                          <FormControl>
                            <DateTimePicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('schedule.open-at-description')}
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
                          <FormLabel>{t('schedule.end-at')}</FormLabel>
                          <FormControl>
                            <DateTimePicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('schedule.end-at-description')}
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
            {isEditing ? t('update') : t('create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
