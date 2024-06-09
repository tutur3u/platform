'use client';

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
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  plan: MeetTogetherPlan;
}

const FormSchema = z.object({
  name: z.string(),
  is_public: z.boolean().optional(),
});

export default function EditPlanDialog({ plan }: Props) {
  const { t } = useTranslation('meet-together-plan-details');
  const router = useRouter();

  const [isOpened, setIsOpened] = useState(false);

  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      name: plan.name || t('untitled_plan'),
      is_public: true,
    },
  });

  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isValid || isSubmitting;

  const handleSubmit = async () => {
    setUpdating(true);

    const data = form.getValues();
    let hasError = false;

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
        title: t('something_went_wrong'),
        description: t('cant_update_plan_right_now'),
      });
    }
  };

  const handleDelete = async () => {
    setDeleting(true);

    const res = await fetch(`/api/meet-together/plans/${plan.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      router.push('/calendar/meet-together');
    } else {
      setDeleting(false);
      toast({
        title: t('something_went_wrong'),
        description: t('cant_delete_plan_right_now'),
      });
    }
  };

  return (
    <Dialog
      open={isOpened}
      onOpenChange={(open) => {
        if (!open) form.reset();
        setIsOpened(open);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil size={24} />
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[425px]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('update_plan')}</DialogTitle>
          <DialogDescription>{t('update_plan_desc')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input placeholder="Name" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <div className="grid w-full gap-2">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    plan.name === form.getValues('name') ||
                    disabled ||
                    updating ||
                    deleting
                  }
                >
                  {updating ? t('updating_plan') : t('update_plan')}
                </Button>

                <Separator />

                <AlertDialog>
                  <AlertDialogTrigger>
                    <Button
                      type="button"
                      className="w-full"
                      variant="destructive"
                      disabled={disabled || updating || deleting}
                    >
                      {deleting ? t('deleting_plan') : t('delete_plan')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('are_you_absolutely_sure')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('delete_plan_warning')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t('common:cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>
                        {t('common:continue')}
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
  );
}
