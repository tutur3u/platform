'use client';

import { useWorkspaceDatasets } from '@/hooks/useWorkspaceDatasets';
import type { WorkspaceCronJob } from '@tuturuuu/types/db';
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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import cronstrue from 'cronstrue';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

function getHumanReadableSchedule(cronExpression: string) {
  try {
    return cronstrue.toString(cronExpression, {
      use24HourTimeFormat: true,
      verbose: true,
    });
  } catch {
    return 'Invalid cron expression';
  }
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  schedule: z.string().min(1, 'Schedule is required'),
  active: z.boolean().default(true),
  dataset_id: z.string({
    required_error: 'Please select a dataset',
  }),
  ws_id: z.string(),
});

interface Props {
  wsId: string;
  data?: WorkspaceCronJob;
  // eslint-disable-next-line no-unused-vars
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

export function CronJobForm({ wsId, data, onFinish }: Props) {
  const router = useRouter();
  const params = useParams();
  const [saving, setSaving] = useState(false);

  // Get dataset ID from URL if available
  const datasetId = params?.datasetId as string;

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id || undefined,
      name: data?.name || '',
      schedule: data?.schedule || '',
      active: data?.active ?? true,
      dataset_id: data?.dataset_id || datasetId || '',
      ws_id: wsId,
    },
  });

  const { data: datasets, isLoading: loadingDatasets } =
    useWorkspaceDatasets(wsId);

  const onSubmit = async (formData: z.infer<typeof FormSchema>) => {
    setSaving(true);
    try {
      const res = await fetch(
        formData.id
          ? `/api/v1/workspaces/${wsId}/cron/jobs/${formData.id}`
          : `/api/v1/workspaces/${wsId}/cron/jobs`,
        {
          method: formData.id ? 'PUT' : 'POST',
          body: JSON.stringify(formData),
        }
      );

      if (res.ok) {
        onFinish?.(formData);
        router.refresh();
      } else {
        const resData = await res.json();
        toast({
          title: `Failed to ${formData.id ? 'update' : 'create'} cron job`,
          description: resData.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${formData.id ? 'update' : 'create'} cron job`,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <ScrollArea className="max-h-96">
          <div className="grid gap-2">
            {data?.id && (
              <>
                <FormField
                  control={form.control}
                  name="id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job ID</FormLabel>
                      <FormControl>
                        <Input {...field} disabled />
                      </FormControl>
                      <FormMessage />
                      <FormDescription>
                        This ID is automatically assigned and cannot be changed.
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <Separator />
              </>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Daily Update Job" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="schedule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Schedule (Cron Expression)</FormLabel>
                  <FormControl>
                    <Input placeholder="0 0 * * *" {...field} />
                  </FormControl>
                  <FormDescription className="flex flex-col gap-1">
                    <span>Common examples:</span>
                    <span className="text-xs text-muted-foreground">
                      • "0 0 * * *" - At midnight, every day
                      <br />
                      • "*/15 * * * *" - Every 15 minutes
                      <br />• "0 9 * * 1-5" - At 9 AM, Monday through Friday
                    </span>
                    {field.value && (
                      <span className="mt-2 text-sm text-muted-foreground">
                        ↳ {getHumanReadableSchedule(field.value)}
                      </span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataset_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dataset</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!!datasetId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingDatasets ? 'Loading...' : 'Select a dataset'
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {datasets?.map((dataset) => (
                        <SelectItem key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {datasetId
                      ? 'Dataset is pre-selected based on the current context'
                      : 'Select the dataset this job will work with'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      id="active"
                    />
                  </FormControl>
                  <label
                    htmlFor="active"
                    className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Active
                  </label>
                </FormItem>
              )}
            />
          </div>
        </ScrollArea>

        <Separator className="my-2" />

        <div className="flex justify-center gap-2">
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
