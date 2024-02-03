'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';
import AvailabilityPlanner from './availability-planner';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';

const formSchema = z.object({
  guestName: z.string().min(1).max(255),
  guestPassword: z.string().max(255).optional(),
});

export default function PlanLogin({ plan }: { plan: MeetTogetherPlan }) {
  const { t } = useTranslation('meet-together-plan-details');

  const [isOpened, setIsOpened] = useState(false);
  const [loading, setLoading] = useState(false);

  //   const [useGuest, setUseGuest] = useState(true);
  const [user, setUser] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      guestName: '',
      guestPassword: '',
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setUser({ id: 'test', name: values.guestName });
    setIsOpened(false);

    // setUseGuest(true);

    // if (useGuest) {
    //   const res = await fetch(`/api/meet-together/plans/${plan.id}/login`, {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //     },
    //     body: JSON.stringify({
    //       name: values.guestName,
    //       password: values.guestPassword,
    //     }),
    //   });

    //   if (res.ok) {
    //     setIsOpened(false);
    //   } else {
    //     const data = await res.json();
    //     form.setError('guestName', { message: data.message });
    //   }
    // }
  }

  const missingFields = !form.getValues().guestName;

  return (
    <Dialog
      open={isOpened}
      onOpenChange={(open) => {
        if (!open) form.reset();
        if (!user) setIsOpened(open);
      }}
    >
      <DialogTrigger asChild={!!user}>
        <AvailabilityPlanner plan={plan} disabled={!user} />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('identity_protection')}</DialogTitle>
          <DialogDescription>{t('identity_protection_desc')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="guestName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('your_name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Tuturuuu"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t('your_name_desc')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="guestPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('password')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="••••••••"
                      type="password"
                      autoComplete="off"
                      disabled={missingFields}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t('password_desc')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={missingFields || loading}
              >
                {loading ? t('common:processing') : t('common:login')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
