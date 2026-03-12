'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { addPlatformEntityCreationLimitTable } from './actions';
import type { AvailableTableRow } from './types';

interface Props {
  wsId: string;
  availableTables: AvailableTableRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AddTableFormValues {
  targetTable: string;
  notes: string;
}

export function AddTableDialog({
  wsId,
  availableTables,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations('entity-creation-limits');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const form = useForm<AddTableFormValues>({
    defaultValues: {
      targetTable: '',
      notes: '',
    },
  });

  const handleDialogOpenChange = (value: boolean) => {
    if (!value) {
      setErrorMessage(null);
    }

    onOpenChange(value);
  };

  const onSubmit = async (values: AddTableFormValues) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('targetTable', values.targetTable);
      formData.append('notes', values.notes);

      await addPlatformEntityCreationLimitTable(wsId, formData);
      router.refresh();
      form.reset();
      handleDialogOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'unexpected_error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add_table.title')}</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          {t('add_table.description')}
        </p>

        {errorMessage ? (
          <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs">
            {t('feedback.error_prefix')}: {errorMessage}
          </div>
        ) : null}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="targetTable"
              rules={{ required: true }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.table_name')}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={availableTables.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t('add_table.select_placeholder')}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableTables.map((table) => (
                        <SelectItem
                          key={table.table_name}
                          value={table.table_name}
                        >
                          {table.table_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormDescription>
              {t('add_table.requirements_hint')}
            </FormDescription>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.notes')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('fields.notes_placeholder')}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDialogOpenChange(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isLoading || availableTables.length === 0}
              >
                {t('add_table.submit')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
