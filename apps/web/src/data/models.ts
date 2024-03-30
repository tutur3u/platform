export const models: {
  value: string;
  label: string;
  model: string;
  provider: string;
  description?: string;
  context: number;
  disabled?: boolean;
}[] = [
  {
    value: 'gemini-1.0-pro',
    label: 'gemini-1.0-pro',
    model: 'gemini-1.0-pro',
    provider: 'Google',
    context: 1,
  },
  {
    value: 'gemini-1.5-pro',
    label: 'gemini-1.5-pro',
    model: 'gemini-1.5-pro',
    provider: 'Google',
    description:
      "Gemini 1.5 Pro is the latest model of the Gemini family. It's a mid-size multimodal model that supports up to 1 million tokens and excels at long-context tasks.",
    context: 1_000_000,
    disabled: true,
  },

  {
    value: 'claude-instant-1.2',
    label: 'claude-instant-1.2',
    model: 'claude-instant-1.2',
    provider: 'Anthropic',
    context: 1,
    disabled: true,
  },
  {
    value: 'claude-1',
    label: 'claude-1',
    model: 'claude-1',
    provider: 'Anthropic',
    context: 1,
    disabled: true,
  },
  {
    value: 'claude-2',
    label: 'claude-2',
    model: 'claude-2',
    provider: 'Anthropic',
    context: 1,
    disabled: true,
  },
  {
    value: 'claude-3-opus',
    label: 'claude-3-opus',
    model: 'claude-3-opus',
    provider: 'Anthropic',
    context: 1,
    disabled: true,
  },
  {
    value: 'claude-3-sonnet',
    label: 'claude-3-sonnet',
    model: 'claude-3-sonnet',
    provider: 'Anthropic',
    context: 1,
    disabled: true,
  },
  {
    value: 'claude-3-haiku',
    label: 'claude-3-haiku',
    model: 'claude-3-haiku',
    provider: 'Anthropic',
    context: 1,
    disabled: true,
  },

  {
    value: 'llama-v2-7b-chat',
    label: 'llama-v2-7b-chat',
    model: 'llama-v2-7b-chat',
    provider: 'Meta',
    context: 1,
    disabled: true,
  },
  {
    value: 'llama-v2-13b-chat',
    label: 'llama-v2-13b-chat',
    model: 'llama-v2-13b-chat',
    provider: 'Meta',
    context: 1,
    disabled: true,
  },
  {
    value: 'llama-v2-70b-chat',
    label: 'llama-v2-70b-chat',
    model: 'llama-v2-70b-chat',
    provider: 'Meta',
    context: 1,
    disabled: true,
  },
  {
    value: 'llama-v2-7b-chat-groq',
    label: 'llama-v2-7b-chat-groq',
    model: 'llama-v2-7b-chat-groq',
    provider: 'Meta',
    context: 1,
    disabled: true,
  },
  {
    value: 'codellama-34b-instruct',
    label: 'codellama-34b-instruct',
    model: 'codellama-34b-instruct',
    provider: 'Meta',
    context: 1,
    disabled: true,
  },
  {
    value: 'codellama-70b-instruct',
    label: 'codellama-70b-instruct',
    model: 'codellama-70b-instruct',
    provider: 'Meta',
    context: 1,
    disabled: true,
  },

  {
    value: 'mistral-7b-instruct-4k',
    label: 'mistral-7b-instruct-4k',
    model: 'mistral-7b-instruct-4k',
    provider: 'Mistral',
    context: 1,
    disabled: true,
  },
  {
    value: 'mixtral-8x7b',
    label: 'mixtral-8x7b',
    model: 'mixtral-8x7b',
    provider: 'Mistral',
    context: 1,
    disabled: true,
  },
  {
    value: 'mixtral-8x7b-groq',
    label: 'mixtral-8x7b-groq',
    model: 'mixtral-8x7b-groq',
    provider: 'Mistral',
    context: 1,
    disabled: true,
  },
  {
    value: 'mistral-small',
    label: 'mistral-small',
    model: 'mistral-small',
    provider: 'Mistral',
    context: 1,
    disabled: true,
  },
  {
    value: 'mistral-medium',
    label: 'mistral-medium',
    model: 'mistral-medium',
    provider: 'Mistral',
    context: 1,
    disabled: true,
  },
  {
    value: 'mistral-large',
    label: 'mistral-large',
    model: 'mistral-large',
    provider: 'Mistral',
    context: 1,
    disabled: true,
  },

  {
    value: 'gpt-4',
    label: 'gpt-4',
    model: 'gpt-4',
    provider: 'OpenAI',
    context: 1,
    disabled: true,
  },
  {
    value: 'gpt-4-0613',
    label: 'gpt-4-0613',
    model: 'gpt-4-0613',
    provider: 'OpenAI',
    context: 1,
    disabled: true,
  },
  {
    value: 'gpt-4-1106-preview',
    label: 'gpt-4-1106-preview',
    model: 'gpt-4-1106-preview',
    provider: 'OpenAI',
    context: 1,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo',
    label: 'gpt-3.5-turbo',
    model: 'gpt-3.5-turbo',
    provider: 'OpenAI',
    context: 1,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo-1106',
    label: 'gpt-3.5-turbo-1106',
    model: 'gpt-3.5-turbo-1106',
    provider: 'OpenAI',
    context: 1,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo-16k',
    label: 'gpt-3.5-turbo-16k',
    model: 'gpt-3.5-turbo-16k',
    provider: 'OpenAI',
    context: 1,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo-16k-0613',
    label: 'gpt-3.5-turbo-16k-0613',
    model: 'gpt-3.5-turbo-16k-0613',
    provider: 'OpenAI',
    context: 1,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo-instruct',
    label: 'gpt-3.5-turbo-instruct',
    model: 'gpt-3.5-turbo-instruct',
    provider: 'OpenAI',
    context: 1,
    disabled: true,
  },
] as const;

export const defaultModel = models[0].value;

export const providers = models.reduce((acc, model) => {
  if (!acc.includes(model.provider)) acc.push(model.provider);
  return acc;
}, [] as Provider[]);

export type Model = (typeof models)[number]['value'];
export type Provider = (typeof models)[number]['provider'];
