import { Send } from '@tuturuuu/icons/lucide';
import { Button } from '@tuturuuu/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import type { UseFormReturn } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import type { ContactMessages } from '../../data/contact/contact-content';
import {
  type ContactFormValues,
  getProductOptions,
} from '../../data/contact/contact-form';

export function ContactFormFields({
  canSubmit,
  form,
  isProfilePending,
  isSubmitting,
  messages,
}: {
  canSubmit: boolean;
  form: UseFormReturn<ContactFormValues>;
  isProfilePending: boolean;
  isSubmitting: boolean;
  messages: ContactMessages;
}) {
  return (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{messages.form.fields.name.label}</FormLabel>
            <FormControl>
              <Input
                disabled
                placeholder={messages.form.fields.name.placeholder}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{messages.form.fields.email.label}</FormLabel>
            <FormControl>
              <Input
                disabled
                placeholder={messages.form.fields.email.placeholder}
                type="email"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <InquiryTypeField form={form} messages={messages} />
        <ProductField form={form} messages={messages} />
      </div>

      <FormField
        control={form.control}
        name="subject"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{messages.form.fields.subject.label}</FormLabel>
            <FormControl>
              <Input
                placeholder={messages.form.fields.subject.placeholder}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="message"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{messages.form.fields.message.label}</FormLabel>
            <FormControl>
              <Textarea
                className="min-h-36 resize-none"
                placeholder={messages.form.fields.message.placeholder}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <Button
        className="w-full"
        disabled={isSubmitting || !canSubmit || isProfilePending}
        size="lg"
        type="submit"
      >
        {isSubmitting ? (
          messages.form.button.sending
        ) : (
          <>
            <Send className="mr-2 h-5 w-5" />
            {messages.form.button.send}
          </>
        )}
      </Button>
    </>
  );
}

function InquiryTypeField({
  form,
  messages,
}: {
  form: UseFormReturn<ContactFormValues>;
  messages: ContactMessages;
}) {
  return (
    <FormField
      control={form.control}
      name="type"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{messages.form.fields.type.label}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue
                  placeholder={messages.form.fields.type.placeholder}
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="support">
                {messages.form.fields.type.options.support}
              </SelectItem>
              <SelectItem value="bug">
                {messages.form.fields.type.options.bug}
              </SelectItem>
              <SelectItem value="feature-request">
                {messages.form.fields.type.options.featureRequest}
              </SelectItem>
              <SelectItem value="job-application">
                {messages.form.fields.type.options.jobApplication}
              </SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ProductField({
  form,
  messages,
}: {
  form: UseFormReturn<ContactFormValues>;
  messages: ContactMessages;
}) {
  return (
    <FormField
      control={form.control}
      name="product"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{messages.form.fields.product.label}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue
                  placeholder={messages.form.fields.product.placeholder}
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {getProductOptions(messages).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
