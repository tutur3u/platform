import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_SUPPORT_INQUIRY_LENGTH,
} from '@tuturuuu/utils/constants';
import * as z from 'zod';
import {
  type ContactMessages,
  type InquiryProduct,
  type InquiryType,
  inquiryTypeValues,
  productValues,
} from './contact-content';

export type ContactProfile = {
  display_name: string | null;
  email: string | null;
  id: string;
};

export type ContactFormValues = {
  email: string;
  message: string;
  name: string;
  product: InquiryProduct;
  subject: string;
  type: InquiryType;
};

export type ContactInquirySubmissionResult =
  | {
      inquiryId: string;
      ok: true;
    }
  | {
      code?: string;
      message: string;
      ok: false;
      status: number;
    };

export type SubmissionStatus = {
  description: string;
  title: string;
  type: 'error' | 'success';
};

export function createSubmissionStatus(
  status: ContactMessages['form']['status'][keyof ContactMessages['form']['status']]
): SubmissionStatus {
  return {
    description: status.description,
    title: status.title,
    type: status.type === 'success' ? 'success' : 'error',
  };
}

export function createContactFormSchema(messages: ContactMessages) {
  return z.object({
    email: z
      .string()
      .email(messages.form.validation.email)
      .max(MAX_EMAIL_LENGTH, messages.form.validation.emailMax),
    message: z
      .string()
      .min(10, messages.form.validation.messageMin)
      .max(MAX_SUPPORT_INQUIRY_LENGTH, messages.form.validation.messageMax),
    name: z
      .string()
      .min(2, messages.form.validation.nameMin)
      .max(MAX_DISPLAY_NAME_LENGTH, messages.form.validation.nameMax),
    product: z.enum(productValues),
    subject: z
      .string()
      .min(5, messages.form.validation.subjectMin)
      .max(255, messages.form.validation.subjectMax),
    type: z.enum(inquiryTypeValues, {
      error: messages.form.validation.type,
    }),
  });
}

export function createDefaultContactFormValues(
  profile: ContactProfile | null
): ContactFormValues {
  const email = profile?.email ?? '';
  const name = profile?.display_name || email.split('@')[0] || '';

  return {
    email,
    message: '',
    name,
    product: 'other',
    subject: '',
    type: 'support',
  };
}

export function getProductOptions(messages: ContactMessages) {
  return [
    { label: messages.form.fields.product.options.web, value: 'web' },
    { label: messages.form.fields.product.options.nova, value: 'nova' },
    { label: messages.form.fields.product.options.rewise, value: 'rewise' },
    { label: messages.form.fields.product.options.calendar, value: 'calendar' },
    { label: messages.form.fields.product.options.finance, value: 'finance' },
    { label: messages.form.fields.product.options.tudo, value: 'tudo' },
    { label: messages.form.fields.product.options.tumeet, value: 'tumeet' },
    { label: messages.form.fields.product.options.other, value: 'other' },
  ] satisfies { label: string; value: InquiryProduct }[];
}
