'use client';

import { createClient } from '@ncthub/supabase/next/client';
import type { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import { Button } from '@ncthub/ui/button';
import { LoadingIndicator } from '@ncthub/ui/custom/loading-indicator';
import { SettingItemTab } from '@ncthub/ui/custom/settings-item-tab';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@ncthub/ui/form';
import { useForm } from '@ncthub/ui/hooks/use-form';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { Eye, EyeOff, Lock } from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import { zodResolver } from '@ncthub/ui/resolvers';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

const formSchema = z
  .object({
    password: z.string().min(8, {
      message: 'Password must be at least 8 characters',
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export default function ResetPasswordForm({ user }: { user: WorkspaceUser }) {
  const t = useTranslations();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    if (!user.email) return;

    setLoading(true);
    try {
      const supabase = createClient();

      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        throw error;
      }

      toast({
        title: t('common.success'),
        description:
          'Password has been updated successfully. You can now log in with your new password.',
      });

      // Close the dialog
      setOpen(false);

      await supabase.auth.signOut();
      router.push('/login?passwordless=false');
      router.refresh();

      // Reset the form
      form.reset();
    } catch (error) {
      console.error('Error resetting password:', error);
      toast({
        title: t('common.error'),
        description:
          'An error occurred while resetting your password. Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingItemTab
      title={t('settings-account.change-password')}
      description={t('settings-account.change-password-description')}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full">
            {t('settings-account.reset-password')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reset-password.reset-password')}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.password')}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pr-10 pl-10"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter new password"
                          {...field}
                          disabled={loading}
                        />
                        <button
                          tabIndex={-1}
                          type="button"
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="pr-10 pl-10"
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Confirm your password"
                          {...field}
                          disabled={loading}
                        />
                        <button
                          tabIndex={-1}
                          type="button"
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
                          onClick={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <LoadingIndicator className="mr-2 h-4 w-4" />
                    {t('reset-password.resetting')}
                  </>
                ) : (
                  t('reset-password.reset-password')
                )}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </SettingItemTab>
  );
}
