'use client';

import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Toaster } from '@tuturuuu/ui/toaster';
import { z } from 'zod';
import { getAiChatMessages } from '../../data/ai-chat/messages';

const formSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'Name must be at least 3 characters.' })
    .max(50, { message: 'Name must not be longer than 50 characters.' }),
  purpose: z
    .string()
    .min(20, { message: 'Purpose must be at least 20 characters.' })
    .max(500, { message: 'Purpose must not be longer than 500 characters.' }),
  personality: z
    .string()
    .min(20, { message: 'Personality must be at least 20 characters.' })
    .max(500, {
      message: 'Personality must not be longer than 500 characters.',
    }),
  expertise: z
    .string()
    .min(20, { message: 'Expertise must be at least 20 characters.' })
    .max(500, { message: 'Expertise must not be longer than 500 characters.' }),
  rules: z
    .string()
    .min(20, { message: 'Rules must be at least 20 characters.' })
    .max(1000, { message: 'Rules must not be longer than 1000 characters.' }),
  exampleConversation: z
    .string()
    .min(50, {
      message: 'Example conversation must be at least 50 characters.',
    })
    .max(2000, {
      message: 'Example conversation must not be longer than 2000 characters.',
    }),
});

type NewChatbotFormValues = z.infer<typeof formSchema>;

const defaultValues: NewChatbotFormValues = {
  exampleConversation: '',
  expertise: '',
  name: '',
  personality: '',
  purpose: '',
  rules: '',
};

const fields = [
  {
    description: "Choose a name that reflects your chatbot's primary function.",
    label: 'Chatbot Name',
    name: 'name',
    placeholder: 'e.g., Marketing Assistant, Code Review Expert',
    type: 'input',
  },
  {
    description:
      'Clearly define what problems this chatbot will solve or tasks it will help with.',
    label: 'Primary Purpose',
    name: 'purpose',
    placeholder:
      'Describe the main tasks and objectives this chatbot should accomplish...',
    textareaClassName: 'min-h-[100px]',
    type: 'textarea',
  },
  {
    description:
      'Define the tone, style, and personality traits (e.g., professional, friendly, technical, casual).',
    label: 'Personality & Communication Style',
    name: 'personality',
    placeholder: 'Describe how the chatbot should interact and communicate...',
    textareaClassName: 'min-h-[100px]',
    type: 'textarea',
  },
  {
    description:
      'List specific areas of expertise, technical knowledge, or subject matter the chatbot should focus on.',
    label: 'Knowledge & Expertise',
    name: 'expertise',
    placeholder:
      'Specify the domains, topics, or skills the chatbot should be knowledgeable about...',
    textareaClassName: 'min-h-[100px]',
    type: 'textarea',
  },
  {
    description:
      'Define boundaries, ethical guidelines, and specific behaviors to avoid.',
    label: 'Rules & Constraints',
    name: 'rules',
    placeholder:
      'List any specific rules, limitations, or guidelines the chatbot should follow...',
    textareaClassName: 'min-h-[100px]',
    type: 'textarea',
  },
  {
    description:
      'Add sample dialogues showing ideal interactions and how the chatbot should handle different scenarios.',
    label: 'Example Conversations',
    name: 'exampleConversation',
    placeholder:
      'Provide example interactions between users and the chatbot...',
    textareaClassName: 'min-h-[150px]',
    type: 'textarea',
  },
] as const satisfies ReadonlyArray<{
  description: string;
  label: string;
  name: keyof NewChatbotFormValues;
  placeholder: string;
  textareaClassName?: string;
  type: 'input' | 'textarea';
}>;

export function NewChatbotForm({ locale }: Readonly<{ locale?: string }>) {
  const messages = getAiChatMessages(locale);
  const form = useForm<NewChatbotFormValues>({
    defaultValues,
    resolver: zodResolver(formSchema),
  });

  function onSubmit(data: NewChatbotFormValues) {
    toast({
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
      title: 'You submitted the following values:',
    });
  }

  return (
    <div className="grid gap-4">
      <FeatureSummary
        description={messages.myChatbotsDescription}
        pluralTitle={messages.newChatbot}
      />
      <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-6 md:flex-row md:items-start">
        <Form {...form}>
          <form
            className="w-full space-y-8"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            {fields.map((fieldConfig) => (
              <FormField
                control={form.control}
                key={fieldConfig.name}
                name={fieldConfig.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{fieldConfig.label}</FormLabel>
                    <FormControl>
                      {fieldConfig.type === 'input' ? (
                        <Input
                          placeholder={fieldConfig.placeholder}
                          type="text"
                          {...field}
                        />
                      ) : (
                        <Textarea
                          className={fieldConfig.textareaClassName}
                          placeholder={fieldConfig.placeholder}
                          {...field}
                        />
                      )}
                    </FormControl>
                    <FormDescription>{fieldConfig.description}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <Button className="w-full" type="submit">
              Create Chatbot
            </Button>
          </form>
        </Form>
      </div>
      <Toaster />
    </div>
  );
}
