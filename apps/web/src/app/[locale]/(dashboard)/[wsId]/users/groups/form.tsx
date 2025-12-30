'use client';

import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: UserGroup;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreate?: boolean;
  canUpdate?: boolean;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  is_guest: z.boolean().default(false),
});

export default function UserGroupForm({
  wsId,
  data,
  onFinish,
  canCreate = false,
  canUpdate = false,
}: Props) {
  const t = useTranslations('ws-user-groups');
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      is_guest: data?.is_guest || false,
    },
  });

  // If no permission to create or update, don't show the form
  if (!canCreate && !canUpdate) {
    return null;
  }

  // If editing and no update permission, don't show the form
  if (data?.id && !canUpdate) {
    return null;
  }

  // If creating and no create permission, don't show the form
  if (!data?.id && !canCreate) {
    return null;
  }

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/user-groups/${data.id}`
          : `/api/v1/workspaces/${wsId}/user-groups`,
        {
          method: data.id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        router.refresh();
      } else {
        const errorData = await res.json();
        toast.error(errorData.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('name')} autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="is_guest"
          render={({ field }) => (
            <FormItem>
              <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
                <div className="flex items-start space-x-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-0.5"
                      aria-describedby="guest-group-description"
                    />
                  </FormControl>
                  <div className="flex-1 space-y-2">
                    <FormLabel className="font-medium text-base leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Guest Group
                    </FormLabel>
                    <p
                      id="guest-group-description"
                      className="text-muted-foreground text-sm leading-relaxed"
                    >
                      Mark this group as a guest group. Guest users will have
                      limited access permissions and restricted functionality
                      within the workspace.
                    </p>
                    {field.value && (
                      <div className="flex items-center space-x-2 rounded bg-amber-50 px-2 py-1 text-amber-600 text-xs dark:bg-amber-900/20 dark:text-amber-400">
                        <svg
                          className="h-3 w-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          role="img"
                          aria-label="Info"
                        >
                          <title>Info icon</title>
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>This group will have restricted permissions</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? t('edit') : t('create')}
        </Button>
      </form>
    </Form>
  );
}
