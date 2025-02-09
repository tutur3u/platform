import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { Checkbox } from '@repo/ui/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { Timezone } from '@tutur3u/types/primitives/Timezone';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  data: Timezone;
  submitLabel?: string;
  onSubmit: (values: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  value: z.string().min(1),
  abbr: z.string().min(1),
  offset: z.number(),
  isdst: z.boolean(),
  text: z.string().min(1),
  utc: z.array(z.string().min(1)),
});

export const ApiConfigFormSchema = FormSchema;

export default function TimezoneForm({ data, submitLabel, onSubmit }: Props) {
  const t = (key: string) => key;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      value: data.value || '',
      abbr: data.abbr || '',
      offset: data.offset || 0,
      isdst: data.isdst || false,
      text: data.text || '',
      utc: data.utc || [],
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('value')}</FormLabel>
              <FormControl>
                <Input placeholder="Value" autoComplete="off" {...field} />
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
              <FormLabel>{t('abbr')}</FormLabel>
              <FormControl>
                <Input placeholder="Abbr" autoComplete="off" {...field} />
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
              <FormLabel>{t('offset')}</FormLabel>
              <FormControl>
                <Input placeholder="Offset" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isdst"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('isdst')}</FormLabel>
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

        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('text')}</FormLabel>
              <FormControl>
                <Input placeholder="Text" autoComplete="off" {...field} />
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
              <FormLabel>{t('utc')}</FormLabel>
              <FormControl>
                <Input placeholder="Utc" autoComplete="off" {...field} />
              </FormControl>
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
