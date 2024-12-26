'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { toast } from '@repo/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { use } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const FormSchema = z.object({
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

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default function WorkspaceUserGroupTagsPage({ params }: Props) {
  const t = useTranslations();

  const { wsId } = use(params);
  console.log(wsId);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  function onSubmit(data: z.infer<typeof FormSchema>) {
    toast({
      title: 'You submitted the following values:',
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(data, null, 2)}</code>
        </pre>
      ),
    });
  }

  return (
    <div className="grid gap-4">
      <FeatureSummary
        pluralTitle={t('ai_chat.new_chatbot')}
        description={t('ai_chat.my_chatbots_description')}
      />
      <div className="border-border bg-foreground/5 flex flex-col justify-between gap-4 rounded-lg border p-6 md:flex-row md:items-start">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="w-full space-y-8"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chatbot Name</FormLabel>
                  <FormControl>
                    <input
                      type="text"
                      className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2"
                      placeholder="e.g., Marketing Assistant, Code Review Expert"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Choose a name that reflects your chatbot's primary function.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Purpose</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the main tasks and objectives this chatbot should accomplish..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Clearly define what problems this chatbot will solve or
                    tasks it will help with.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="personality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Personality & Communication Style</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe how the chatbot should interact and communicate..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Define the tone, style, and personality traits (e.g.,
                    professional, friendly, technical, casual).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expertise"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Knowledge & Expertise</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Specify the domains, topics, or skills the chatbot should be knowledgeable about..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    List specific areas of expertise, technical knowledge, or
                    subject matter the chatbot should focus on.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rules"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rules & Constraints</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="List any specific rules, limitations, or guidelines the chatbot should follow..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Define boundaries, ethical guidelines, and specific
                    behaviors to avoid.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="exampleConversation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Example Conversations</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide example interactions between users and the chatbot..."
                      className="min-h-[150px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Add sample dialogues showing ideal interactions and how the
                    chatbot should handle different scenarios.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full">
              Create Chatbot
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
