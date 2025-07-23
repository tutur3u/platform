'use client';

import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Pencil } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import type { JSONContent } from '@tuturuuu/ui/tiptap';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  plan: MeetTogetherPlan;
}

const FormSchema = z.object({
  name: z.string(),
  is_public: z.boolean().optional(),
  agenda_content: z.custom<JSONContent>().optional(),
});

type FormData = z.infer<typeof FormSchema>;

export default function EditPlanDialog({ plan }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const [isOpened, setIsOpened] = useState(false);

  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      name: plan.name || t('meet-together.untitled_plan'),
      is_public: true,
      agenda_content: plan.agenda_content ?? undefined,
    },
  });

  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isValid || isSubmitting;

  const handleSubmit = async (data: FormData) => {
    console.log(data);
    setUpdating(true);

    const hasError = false;

    if (hasError) {
      setUpdating(false);
      return;
    }

    const res = await fetch(`/api/meet-together/plans/${plan.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    if (res.ok) {
      router.refresh();
      setUpdating(false);
      setIsOpened(false);
    } else {
      setUpdating(false);
      toast({
        title: t('meet-together-plan-details.something_went_wrong'),
        description: t('meet-together-plan-details.cant_update_plan_right_now'),
      });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);

    const res = await fetch(`/api/meet-together/plans/${plan.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      router.push('/meet-together');
    } else {
      setDeleting(false);
      toast({
        title: t('meet-together-plan-details.something_went_wrong'),
        description: t('meet-together-plan-details.cant_delete_plan_right_now'),
      });
    }
  };

  return (
    <span className="group relative">
      <Dialog
        open={isOpened}
        onOpenChange={(open) => {
          if (!open) form.reset();
          setIsOpened(open);
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Pencil size={24} />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {t('meet-together-plan-details.update_plan')}
            </DialogTitle>
            <DialogDescription>
              {t('meet-together-plan-details.update_plan_desc')}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('meet-together-plan-details.name')}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Name" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator className="my-6" />

              {/* Extra Features Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Extra Features
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enhance your meeting plan with additional features to make
                  coordination easier.
                </p>

                <FormField
                  control={form.control}
                  name="agenda_content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('meet-together.agenda')}</FormLabel>
                      <FormControl>
                        <div className="h-64 overflow-y-auto">
                          <RichTextEditor
                            content={field.value || null}
                            onChange={field.onChange}
                            readOnly={false}
                            titlePlaceholder={t(
                              'meet-together.agenda_title_placeholder'
                            )}
                            writePlaceholder={t(
                              'meet-together.agenda_content_placeholder'
                            )}
                            saveButtonLabel={t('meet-together.save_agenda')}
                            savedButtonLabel={t('meet-together.agenda_saved')}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <div className="grid w-full gap-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={disabled || updating || deleting}
                  >
                    {updating
                      ? t('meet-together-plan-details.updating_plan')
                      : t('meet-together-plan-details.update_plan')}
                  </Button>

                  <Separator />

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        className="w-full"
                        variant="destructive"
                        disabled={disabled || updating || deleting}
                      >
                        {deleting
                          ? t('meet-together-plan-details.deleting_plan')
                          : t('meet-together-plan-details.delete_plan')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t(
                            'meet-together-plan-details.are_you_absolutely_sure'
                          )}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('meet-together-plan-details.delete_plan_warning')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                          {t('common.continue')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </span>
  );
}
