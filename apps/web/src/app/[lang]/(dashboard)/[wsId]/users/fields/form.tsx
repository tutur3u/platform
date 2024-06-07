import { DatePicker } from '@/components/row-actions/users/date-picker';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { fetcher } from '@/utils/fetcher';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { CheckIcon, ChevronsUpDown, PlusIcon, XIcon } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import * as z from 'zod';

interface Props {
  data: WorkspaceUserField;
  submitLabel?: string;
  onSubmit: (values: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1),
  possible_values: z.array(z.string()).optional(),
  default_value: z.string().optional(),
  notes: z.string().optional(),
});

export const ApiConfigFormSchema = FormSchema;

export default function UserFieldForm({ data, submitLabel, onSubmit }: Props) {
  const { t } = useTranslation('ws-user-fields');

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      name: data.name || '',
      description: data.description || '',
      type: data.type || '',
      possible_values: data.possible_values || [],
      default_value: data.default_value || '',
      notes: data.notes || '',
    },
  });

  const isSubmitting = form.formState.isSubmitting;
  const disabled = isSubmitting;

  const [showTypes, setShowTypes] = useState(false);

  const { data: types, error: typesError } = useSWR<{ id: string }[]>(
    `/api/v1/infrastructure/users/fields/types`,
    fetcher
  );

  const typesLoading = !types && !typesError;

  return (
    <Form {...form}>
      <ScrollArea className="group h-96 w-full">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-3 p-4 pt-0 transition-all"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('name')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('name')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{t('type')}</FormLabel>
                <Popover open={showTypes} onOpenChange={setShowTypes}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          'justify-between',
                          !field.value && 'text-muted-foreground'
                        )}
                        disabled={!!data.id || typesLoading}
                      >
                        {field.value
                          ? t(
                              types
                                ?.find((t) => t.id === field.value)
                                ?.id.toLowerCase() || ''
                            )
                          : typesLoading
                            ? t('common:loading')
                            : t('select_type')}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command
                      filter={(value, search) => {
                        if (value.includes(search)) return 1;
                        return 0;
                      }}
                    >
                      <CommandInput
                        placeholder="Search type..."
                        disabled={typesLoading}
                      />
                      <CommandEmpty>No type found.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          {(types?.length || 0) > 0
                            ? types?.map((type) => (
                                <CommandItem
                                  key={type.id}
                                  value={type.id}
                                  onSelect={() => {
                                    form.setValue('type', type.id || '');
                                    setShowTypes(false);

                                    if (type.id === 'BOOLEAN') {
                                      form.setValue('possible_values', [
                                        'true',
                                        'false',
                                      ]);
                                    } else {
                                      form.setValue('possible_values', ['']);
                                    }
                                  }}
                                  disabled={['DATETIME'].includes(type.id)}
                                >
                                  <CheckIcon
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      type.id === field.value
                                        ? 'opacity-100'
                                        : 'opacity-0'
                                    )}
                                  />
                                  {t(type.id.toLowerCase())}
                                </CommandItem>
                              ))
                            : null}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <FormField
            control={form.control}
            name="possible_values"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('possible_values')}</FormLabel>
                <FormDescription>
                  {t('possible_values_description')}
                </FormDescription>
                <div
                  className={
                    form.getValues('type') === 'BOOLEAN'
                      ? 'flex gap-2'
                      : 'grid gap-2'
                  }
                >
                  {field.value?.map((value, index) => (
                    <div key={index} className="flex w-full gap-1">
                      <FormControl>
                        {form.getValues('type') === 'DATE' ? (
                          <DatePicker
                            defaultValue={value ? new Date(value) : undefined}
                            onValueChange={(value) => {
                              const values = field.value || [];
                              values[index] = value
                                ? dayjs(value).format('YYYY-MM-DD')
                                : '';
                              form.setValue('possible_values', values);
                            }}
                            className="w-full"
                          />
                        ) : (
                          <Input
                            type={
                              form.getValues('type') === 'NUMBER'
                                ? 'number'
                                : 'text'
                            }
                            placeholder={t('value')}
                            autoComplete="off"
                            className="w-full"
                            value={value}
                            onChange={(e) => {
                              const values = field.value || [];
                              values[index] = e.target.value;
                              form.setValue('possible_values', values);
                            }}
                            disabled={form.getValues('type') === 'BOOLEAN'}
                          />
                        )}
                      </FormControl>
                      {form.getValues('type') !== 'BOOLEAN' && (
                        <Button
                          size="icon"
                          type="button"
                          variant="destructive"
                          onClick={() => {
                            const values = field.value || [];
                            values.splice(index, 1);
                            form.setValue('possible_values', values);
                          }}
                        >
                          <XIcon />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.getValues('type') !== 'BOOLEAN' && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                form.setValue('possible_values', [
                  ...(form.getValues('possible_values') || []),
                  '',
                ]);
              }}
              disabled={!form.getValues('type')}
            >
              {t('add_possible_value')}
              <PlusIcon className="ml-2" />
            </Button>
          )}

          <FormField
            control={form.control}
            name="default_value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('default_value')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('null')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Separator />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('description')}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t('description')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('notes')}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t('notes')}
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={disabled}>
            {submitLabel}
          </Button>
        </form>
      </ScrollArea>
    </Form>
  );
}
