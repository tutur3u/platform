import { UseChatHelpers } from 'ai/react';

import { Button } from '@/components/ui/button';
import { IconArrowRight } from '@/components/ui/icons';

const exampleMessages = [
  {
    heading: 'Explain technical concepts',
    message: `What is quantum computing?`,
  },
  {
    heading: 'Generate math problems',
    message: `Generate a list of hard but interesting math problems for undergraduates.`,
  },
  {
    heading: 'Explain to a 5th grader',
    message: `Explain the following concepts like I'm a fifth grader: \n\n`,
  },
  {
    heading: 'Write a poem',
    message: `Write a poem about the following topics: \n\n`,
  },
  {
    heading: 'Summarize an article',
    message: 'Summarize the following article for a 2nd grader: \n\n',
  },
  {
    heading: 'Draft an email',
    message: `Draft an email to my boss about the following: \n\n`,
  },
];

export function EmptyScreen({ setInput }: Pick<UseChatHelpers, 'setInput'>) {
  return (
    <div className="mx-auto max-w-2xl lg:max-w-4xl">
      <div className="bg-background rounded-lg border p-8">
        <h1 className="mb-2 text-lg font-semibold">
          Welcome to{' '}
          <span className="bg-gradient-to-r from-pink-600 via-yellow-500 to-sky-600 bg-clip-text font-bold text-transparent dark:from-pink-300 dark:via-amber-300 dark:to-blue-300">
            Tuturuuu AI
          </span>{' '}
          Chat.
        </h1>
        <p className="text-muted-foreground leading-normal">
          You can start a conversation here or try the following examples:
        </p>
        <div className="mt-4 flex flex-col items-start space-y-2">
          {exampleMessages.map((message, index) => (
            <Button
              key={index}
              variant="link"
              className="h-auto p-0 text-base"
              onClick={() => setInput(message.message)}
            >
              <IconArrowRight className="text-muted-foreground mr-2" />
              {message.heading}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
