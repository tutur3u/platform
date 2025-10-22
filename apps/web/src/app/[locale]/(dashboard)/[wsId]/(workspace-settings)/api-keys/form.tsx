import type { WorkspaceApiKey } from '@tuturuuu/types/db';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import * as z from 'zod';

interface Role {
  id: string;
  name: string;
}

interface Props {
  data: Partial<WorkspaceApiKey> & { ws_id: string };
  roles?: Role[];
  submitLabel?: string;
  onSubmit: (values: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  role_id: z.string().nullable(),
  expires_at: z.string().nullable(),
  expires_preset: z.string(), // Stable preset value: '30', '90', '365', or 'none'
});

export const ApiConfigFormSchema = FormSchema;

export default function ApiKeyForm({
  data,
  roles,
  submitLabel,
  onSubmit,
}: Props) {
  const t = useTranslations('ws-api-keys');

  // Determine the initial preset value based on expires_at
  const getInitialPreset = (expiresAt: string | null | undefined): string => {
    if (!expiresAt) return 'none';
    // For existing keys, we can't reliably reverse-calculate the preset
    // So we'll default to 'none' and let the user see/change it if needed
    return 'none';
  };

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      name: data.name || '',
      description: data.description || '',
      role_id: data.role_id || null,
      expires_at: data.expires_at || null,
      expires_preset: getInitialPreset(data.expires_at),
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const expirationPresets = [
    { label: t('no_expiration'), value: null },
    { label: t('expires_30_days'), value: 30 },
    { label: t('expires_90_days'), value: 90 },
    { label: t('expires_365_days'), value: 365 },
  ];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('name_placeholder')}
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('name_description')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('description_label')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('description_placeholder')}
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('description_description')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {roles && roles.length > 0 && (
          <FormField
            control={form.control}
            name="role_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('role_label')}</FormLabel>
                <Select
                  onValueChange={(value) =>
                    field.onChange(value === 'none' ? null : value)
                  }
                  value={field.value || 'none'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('role_placeholder')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">{t('no_role')}</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{t('role_description')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="expires_preset"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('expiration_label')}</FormLabel>
              <Select
                onValueChange={(value) => {
                  // Update the preset field
                  field.onChange(value);
                  // Update the expires_at field based on the preset
                  if (value === 'none') {
                    form.setValue('expires_at', null);
                  } else {
                    const days = parseInt(value, 10);
                    const expirationDate = new Date();
                    expirationDate.setDate(expirationDate.getDate() + days);
                    form.setValue('expires_at', expirationDate.toISOString());
                  }
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('expiration_placeholder')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {expirationPresets.map((preset) => (
                    <SelectItem
                      key={preset.value?.toString() || 'none'}
                      value={preset.value?.toString() || 'none'}
                    >
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>{t('expiration_description')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
