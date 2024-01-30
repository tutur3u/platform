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
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Timezone } from '@/types/primitives/Timezone';
import useTranslation from 'next-translate/useTranslation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import dayjs from 'dayjs';

interface Props {
  plan: {
    dates: Date[] | undefined;
    startTime: number | undefined;
    endTime: number | undefined;
    timezone: Timezone | undefined;
  };
}

const FormSchema = z.object({
  name: z.string(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  timezone: z.number().optional(),
  dates: z.array(z.string()).optional(),
});

export default function CreatePlanDialog({ plan }: Props) {
  const { t } = useTranslation('meet-together');

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      name: '',
      startTime: plan.startTime,
      endTime: plan.endTime,
      timezone: plan.timezone?.offset,
      dates: plan.dates
        ?.sort((a, b) => a.getTime() - b.getTime())
        ?.map((date) => dayjs(date).format('YYYY-MM-DD')),
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const handleSubmit = () => {
    console.log(plan);
    console.log(form.getValues());
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="relative inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-rose-400 to-orange-300 px-8 py-2 font-bold text-white transition-all md:text-lg dark:from-rose-400/60 dark:to-orange-300/60">
          {t('create-plan')}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>
            Create a new plan to meet together with your friends, family, or
            colleagues.
          </DialogDescription>
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
              <Button type="submit" className="w-full" disabled={disabled}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
