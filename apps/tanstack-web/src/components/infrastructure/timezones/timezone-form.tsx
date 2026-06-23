'use client';

import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { z } from 'zod';
import {
  formatTimezoneMetadata,
  normalizeUtc,
  parseTimezoneMetadataInput,
} from './timezone-utils';
import type {
  TimezoneManagementLabels,
  TimezoneManagementRecord,
  TimezoneMutationPayload,
} from './types';

const timezoneFormSchema = z.object({
  abbr: z.string().optional(),
  hours: z.string().optional(),
  id: z.string().optional(),
  isdst: z.boolean(),
  offset: z.number(),
  priority: z.string().optional(),
  status: z.enum(['synced', 'outdated', 'pending', 'error']),
  text: z.string().optional(),
  utc: z.string().optional(),
  value: z.string().trim().min(1),
});

export type TimezoneFormValues = z.infer<typeof timezoneFormSchema>;

type TimezoneFormProps = {
  data?: TimezoneManagementRecord;
  isPending?: boolean;
  labels: TimezoneManagementLabels;
  onSubmit: (payload: TimezoneMutationPayload) => Promise<void> | void;
};

function getDefaultValues(data?: TimezoneManagementRecord): TimezoneFormValues {
  return {
    abbr: data?.abbr ?? '',
    hours:
      data?.hours == null || data.hours === ''
        ? ''
        : formatTimezoneMetadata(data.hours),
    id: data?.id ?? '',
    isdst: data?.isdst ?? false,
    offset: data?.offset ?? 0,
    priority:
      data?.priority == null || data.priority === ''
        ? ''
        : formatTimezoneMetadata(data.priority),
    status: data?.status ?? 'pending',
    text: data?.text ?? '',
    utc: normalizeUtc(data?.utc).join(', '),
    value: data?.value ?? '',
  };
}

function toPayload(values: TimezoneFormValues): TimezoneMutationPayload {
  return {
    abbr: values.abbr?.trim() ?? '',
    hours: parseTimezoneMetadataInput(values.hours),
    id: values.id?.trim() || null,
    isdst: values.isdst,
    offset: values.offset,
    priority: parseTimezoneMetadataInput(values.priority),
    status: values.status,
    text: values.text?.trim() ?? '',
    utc: normalizeUtc(values.utc),
    value: values.value.trim(),
  };
}

export function TimezoneForm({
  data,
  isPending,
  labels,
  onSubmit,
}: TimezoneFormProps) {
  const form = useForm<TimezoneFormValues>({
    defaultValues: getDefaultValues(data),
    resolver: zodResolver(timezoneFormSchema),
  });

  const disabled =
    isPending ||
    form.formState.isSubmitting ||
    !form.formState.isDirty ||
    !form.formState.isValid;

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(toPayload(values));
        })}
      >
        {data?.id ? (
          <FormField
            control={form.control}
            name="id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.form.id}</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="off" disabled />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.form.value}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="abbr"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.form.abbr}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="offset"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.form.offset}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    inputMode="decimal"
                    type="number"
                    value={field.value}
                    onChange={(event) =>
                      field.onChange(Number(event.target.value))
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.form.status}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(labels.status).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hours"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.form.hours}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{labels.form.priority}</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.form.text}</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="utc"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{labels.form.utc}</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormDescription>{labels.form.utcDescription}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isdst"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-3">
              <FormLabel className="font-medium text-sm">
                {labels.form.isdst}
              </FormLabel>
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button className="w-full" disabled={disabled} type="submit">
          {isPending || form.formState.isSubmitting
            ? labels.actions.saving
            : labels.actions.save}
        </Button>
      </form>
    </Form>
  );
}
