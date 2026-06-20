import { useMutation } from '@tanstack/react-query';
import { Card } from '@tuturuuu/ui/card';
import { Form } from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useState } from 'react';
import type { ContactMessages } from '../../data/contact/contact-content';
import {
  type ContactFormValues,
  type ContactInquirySubmissionResult,
  type ContactProfile,
  createContactFormSchema,
  createDefaultContactFormValues,
  createSubmissionStatus,
  type SubmissionStatus,
} from '../../data/contact/contact-form';
import type { Locale } from '../../lib/platform/locale';
import { ContactFormFields } from './contact-form-fields';
import { AuthRequiredNotice, SubmissionNotice } from './contact-form-notices';

export function ContactForm({
  isProfilePending,
  locale,
  messages,
  profile,
  submitInquiry,
}: {
  isProfilePending: boolean;
  locale: Locale;
  messages: ContactMessages;
  profile: ContactProfile | null;
  submitInquiry: (
    values: ContactFormValues
  ) => Promise<ContactInquirySubmissionResult>;
}) {
  const [submissionStatus, setSubmissionStatus] =
    useState<SubmissionStatus | null>(null);
  const formSchema = createContactFormSchema(messages);
  const form = useForm({
    defaultValues: createDefaultContactFormValues(profile),
    resolver: zodResolver(formSchema),
  });
  const canSubmit = Boolean(profile);

  const supportInquiryMutation = useMutation({
    mutationFn: submitInquiry,
    onError: () => {
      setSubmissionStatus(createSubmissionStatus(messages.form.status.error));
    },
    onSuccess: (result) => {
      if (!result.ok) {
        const isUnauthorized = result.status === 401;

        setSubmissionStatus(
          createSubmissionStatus(
            isUnauthorized
              ? messages.form.status.authRequired
              : messages.form.status.error
          )
        );

        return;
      }

      form.reset(createDefaultContactFormValues(profile));
      setSubmissionStatus(createSubmissionStatus(messages.form.status.success));
    },
  });

  return (
    <Card className="border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-6">
      {!isProfilePending && !profile ? (
        <AuthRequiredNotice href={`/${locale}/login`} messages={messages} />
      ) : null}

      {submissionStatus ? <SubmissionNotice status={submissionStatus} /> : null}

      <Form {...form}>
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit((values) => {
            setSubmissionStatus(null);

            if (!canSubmit) {
              setSubmissionStatus(
                createSubmissionStatus(messages.form.status.authRequired)
              );
              return;
            }

            supportInquiryMutation.mutate(values);
          })}
        >
          <ContactFormFields
            canSubmit={canSubmit}
            form={form}
            isProfilePending={isProfilePending}
            isSubmitting={supportInquiryMutation.isPending}
            messages={messages}
          />
        </form>
      </Form>
    </Card>
  );
}
