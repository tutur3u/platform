'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useEffect } from 'react';
import useTranslation from 'next-translate/useTranslation';
import { SendHorizonal } from 'lucide-react';

const FormSchema = z.object({
  prompt: z.string().min(1).max(2048),
});

interface Props {
  input: string;
  setInput: (input: string) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function ChatForm({ input, setInput, handleSubmit }: Props) {
  const { t } = useTranslation('ai-chat');

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const prompt = form.watch('prompt');

  useEffect(() => {
    setInput(prompt);
  }, [prompt, setInput]);

  useEffect(() => {
    // set prompt to empty string when input is empty
    if (!input) form.setValue('prompt', '');
  }, [input, form]);

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit}
        className="flex w-full items-end gap-2 md:w-96 md:max-w-xl"
      >
        <FormField
          control={form.control}
          name="prompt"
          render={({ field }) => (
            <FormItem className="w-full">
              <FormControl>
                <Input
                  {...field}
                  className="focus-visible:ring-transparent"
                  placeholder={t('prompt_placeholder')}
                  autoComplete="off"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          size="icon"
          type="submit"
          disabled={
            !form.formState.isValid || form.formState.isSubmitting || !input
          }
        >
          <SendHorizonal className="h-5 w-5" />
        </Button>
      </form>
    </Form>
  );
}
