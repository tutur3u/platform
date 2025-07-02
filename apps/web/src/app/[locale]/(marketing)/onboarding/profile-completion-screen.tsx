'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { ArrowLeft, ArrowRight, Loader2, User } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

const FormSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

interface ProfileCompletionScreenProps {
  user: WorkspaceUser;
  onBack: () => void;
  // eslint-disable-next-line no-unused-vars
  onContinue: (data: {
    displayName: string;
    bio?: string;
    avatarUrl?: string;
  }) => void;
  initialData?: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  };
  loading?: boolean;
}

export default function ProfileCompletionScreen({
  user,
  onBack,
  onContinue,
  initialData,
  loading = false,
}: ProfileCompletionScreenProps) {
  const t = useTranslations('onboarding.profile-completion');

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      displayName:
        initialData?.displayName || user.display_name || user.full_name || '',
      bio: initialData?.bio || user.bio || '',
      avatarUrl: initialData?.avatarUrl || user.avatar_url || '',
    },
  });

  const handleSubmit = (data: z.infer<typeof FormSchema>) => {
    onContinue({
      displayName: data.displayName,
      bio: data.bio || undefined,
      avatarUrl: data.avatarUrl || undefined,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full shadow-lg">
              <User className="h-8 w-8" />
            </div>
            <h1 className="mb-4 text-3xl font-bold text-gray-900 md:text-4xl dark:text-white">
              {t('title')}
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              {t('subtitle')}
            </p>
          </div>

          {/* Form */}
          <Card className="border bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-semibold">
                {t('profile-details')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(handleSubmit)}
                  className="space-y-6"
                >
                  {/* Display Name */}
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">
                          {t('display-name')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('display-name-placeholder')}
                            {...field}
                            disabled={loading}
                            className="h-11 text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Bio */}
                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">
                          {t('bio')}{' '}
                          <span className="text-sm font-normal text-gray-500">
                            {t('bio-optional')}
                          </span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={t('bio-placeholder')}
                            rows={3}
                            {...field}
                            disabled={loading}
                            className="resize-none text-base"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Tip */}
                  <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {t('profile-tip')}
                    </p>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onBack}
                      disabled={loading}
                      className="border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      {t('back')}
                    </Button>

                    <Button
                      type="submit"
                      disabled={loading || !form.formState.isValid}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('updating')}
                        </>
                      ) : (
                        <>
                          {t('continue')}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
