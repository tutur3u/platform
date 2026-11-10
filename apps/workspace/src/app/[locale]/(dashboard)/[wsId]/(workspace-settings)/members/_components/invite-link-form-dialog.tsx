'use client';

import { Link2, Pencil } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useTranslations } from 'next-intl';
import * as z from 'zod';

export const InviteLinkFormSchema = z.object({
  expiresAt: z.string().optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  memberType: z.enum(['MEMBER', 'GUEST']),
});

export type InviteLinkFormValues = z.infer<typeof InviteLinkFormSchema>;

type Props = {
  initialValues?: InviteLinkFormValues;
  isSubmitting: boolean;
  mode: 'create' | 'edit';
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InviteLinkFormValues) => void;
  open: boolean;
};

export function InviteLinkFormDialog({
  initialValues,
  isSubmitting,
  mode,
  onOpenChange,
  onSubmit,
  open,
}: Props) {
  const t = useTranslations();
  const form = useForm({
    resolver: zodResolver(InviteLinkFormSchema),
    defaultValues: initialValues ?? {
      expiresAt: null,
      maxUses: null,
      memberType: 'MEMBER' as const,
    },
  });
  const isEdit = mode === 'edit';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
            {isEdit ? (
              <Pencil className="h-4 w-4" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
          </div>
          <DialogTitle>
            {t(
              isEdit
                ? 'ws-invite-links.edit-link'
                : 'ws-invite-links.create-link'
            )}
          </DialogTitle>
          <DialogDescription>
            {t('ws-invite-links.create-description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="memberType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('ws-members.invite_membership_label')}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="MEMBER">
                        {t('ws-members.invite_membership_member')}
                      </SelectItem>
                      <SelectItem value="GUEST">
                        {t('ws-members.invite_membership_guest')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {t('ws-invite-links.membership-type-description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="maxUses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ws-invite-links.max-uses')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder={t('ws-invite-links.max-uses-placeholder')}
                        {...field}
                        value={field.value?.toString() ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('ws-invite-links.max-uses-description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('ws-invite-links.expires-at')}</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('ws-invite-links.expires-at-description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? t('common.loading')
                  : t(
                      isEdit
                        ? 'common.update_action'
                        : 'ws-invite-links.create-link'
                    )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
