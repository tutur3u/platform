export const models: {
  value: string;
  label: string;
  provider: string;
  description?: string;
  context?: number;
  disabled?: boolean;
}[] = [
  {
    value: 'gemini-2.0-pro-exp-02-05',
    label: 'gemini-2.0-pro-exp-02-05',
    provider: 'Google',
    description:
      'Gemini 2.0 Pro Exp 02-05 is a multimodal model that supports up to 1 million tokens and excels at long-context tasks.',
    context: 2000000,
  },
  {
    value: 'gemini-2.0-flash-001',
    label: 'gemini-2.0-flash',
    provider: 'Google',
    description:
      'Gemini 2.0 Flash delivers next-gen features and improved capabilities, including superior speed, native tool use, multimodal generation, and a 1M token context window.',
    context: 1000000,
  },
  {
    value: 'gemini-2.0-flash-thinking-exp-01-21',
    label: 'gemini-2.0-flash-thinking-exp-01-21',
    provider: 'Google',
    description:
      'Gemini 2.0 Flash Thinking Exp 01-21 is a multimodal model that supports up to 1 million tokens and excels at long-context tasks.',
    context: 1000000,
  },
  {
    value: 'gemini-2.0-flash-lite-preview-02-05',
    label: 'gemini-2.0-flash-lite-preview-02-05',
    provider: 'Google',
    description:
      'Gemini 2.0 Flash Lite Preview 02-05 is a multimodal model that supports up to 1 million tokens and excels at long-context tasks.',
    context: 1000000,
  },
  {
    value: 'gemini-1.5-flash',
    label: 'gemini-1.5-flash',
    provider: 'Google',
    description:
      "Gemini 1.5 Flash is the latest model of the Gemini family. It's a multimodal model that supports up to 1 million tokens. It is optimized for speed and efficiency.",
    context: 1000000,
  },
  {
    value: 'gemini-1.5-pro',
    label: 'gemini-1.5-pro',
    provider: 'Google',
    description:
      "Gemini 1.5 Pro is the latest model of the Gemini family. It's a mid-size multimodal model that supports up to 1 million tokens and excels at long-context tasks.",
    context: 2000000,
  },

  {
    value: 'imagen-3.0-generate-001',
    label: 'imagen-3.0-generate-001',
    provider: 'Google Vertex',
    description:
      'Imagen 3.0 helps you generate high-quality images from text descriptions.',
    disabled: true,
  },
  {
    value: 'imagen-3.0-fast-generate-001',
    label: 'imagen-3.0-fast-generate-001',
    provider: 'Google Vertex',
    description:
      'Imagen 3.0 helps you generate high-quality images from text descriptions.',
    disabled: true,
  },
  {
    value: 'gemini-2.0-pro-exp-02-05',
    label: 'gemini-2.0-pro-exp-02-05',
    provider: 'Google Vertex',
    description:
      'Gemini 2.0 Pro Exp 02-05 is a multimodal model that supports up to 1 million tokens and excels at long-context tasks.',
    context: 2000000,
  },
  {
    value: 'gemini-2.0-flash-001',
    label: 'gemini-2.0-flash',
    provider: 'Google Vertex',
    description:
      'Gemini 2.0 Flash delivers next-gen features and improved capabilities, including superior speed, native tool use, multimodal generation, and a 1M token context window.',
    context: 1000000,
  },
  {
    value: 'gemini-2.0-flash-thinking-exp-01-21',
    label: 'gemini-2.0-flash-thinking-exp-01-21',
    provider: 'Google Vertex',
    description:
      'Gemini 2.0 Flash Thinking Exp 01-21 is a multimodal model that supports up to 1 million tokens and excels at long-context tasks.',
    context: 1000000,
  },
  {
    value: 'gemini-2.0-flash-lite-preview-02-05',
    label: 'gemini-2.0-flash-lite-preview-02-05',
    provider: 'Google Vertex',
    description:
      'Gemini 2.0 Flash Lite Preview 02-05 is a multimodal model that supports up to 1 million tokens and excels at long-context tasks.',
    context: 1000000,
  },
  {
    value: 'gemini-1.5-flash-002',
    label: 'gemini-1.5-flash-002',
    provider: 'Google Vertex',
    description:
      "Gemini 1.5 Flash is the latest model of the Gemini family. It's a multimodal model that supports up to 1 million tokens. It is optimized for speed and efficiency.",
    context: 1000000,
  },
  {
    value: 'gemini-1.5-pro-002',
    label: 'gemini-1.5-pro-002',
    provider: 'Google Vertex',
    description:
      "Gemini 1.5 Pro is the latest model of the Gemini family. It's a mid-size multimodal model that supports up to 1 million tokens and excels at long-context tasks.",
    context: 2000000,
  },

  {
    value: 'claude-3-5-sonnet-latest',
    label: 'claude-3.5-sonnet (latest)',
    provider: 'Anthropic',
    description:
      'Claude 3.5 Sonnet strikes the ideal balance between intelligence and speed—particularly for enterprise workloads. It delivers strong performance at a lower cost compared to its peers, and is engineered for high endurance in large-scale AI deployments.',
    context: 200000,
    disabled: true,
  },
  {
    value: 'claude-3-5-haiku-latest',
    label: 'claude-3.5-haiku (latest)',
    provider: 'Anthropic',
    description:
      'Claude 3.5 Haiku is a high-performance model that excels at generating high-quality text. It is ideal for tasks that require a high level of creativity and language understanding.',
    context: 200000,
    disabled: true,
  },

  {
    value: 'llama-3-8b-instruct',
    label: 'llama-3-8b-instruct',
    provider: 'Meta',
    description:
      'Llama is a 8 billion parameter open source model by Meta fine-tuned for instruction following purposes served by Perplexity.',
    context: 8192,
    disabled: true,
  },
  {
    value: 'llama-3-70b-instruct',
    label: 'llama-3-70b-instruct',
    provider: 'Meta',
    description:
      'Llama is a 70 billion parameter open source model by Meta fine-tuned for instruction following purposes served by Perplexity.',
    context: 8192,
    disabled: true,
  },

  {
    value: 'mistral-small',
    label: 'mistral-small',
    provider: 'Mistral',
    description:
      'Mistral Small is the ideal choice for simple tasks that one can do in bulk - like Classification, Customer Support, or Text Generation. It offers excellent performance at an affordable price point.',
    context: 32000,
    disabled: true,
  },
  {
    value: 'mistral-medium',
    label: 'mistral-medium',
    provider: 'Mistral',
    description:
      'Mistral Medium is the ideal for intermediate tasks that require moderate reasoning - like Data extraction, Summarizing a Document, Writing a Job Description, or Writing Product Descriptions. Mistral Medium strikes a balance between performance and capability, making it suitable for a wide range of tasks that only require language transformation.',
    context: 32000,
    disabled: true,
  },
  {
    value: 'mistral-large',
    label: 'mistral-large',
    provider: 'Mistral',
    description:
      'Mistral Large is ideal for complex tasks that require large reasoning capabilities or are highly specialized - like Synthetic Text Generation, Code Generation, RAG, or Agents.',
    context: 32000,
    disabled: true,
  },
  {
    value: 'mistral-codestral',
    label: 'mistral-codestral',
    provider: 'Mistral',
    description:
      'Mistral Codestral 22B is an open-weight generative AI model explicitly designed for code generation tasks. It helps developers write and interact with code through a shared instruction and completion API endpoint. As it masters code and English, it can be used to design advanced AI applications for software developers.',
    context: 32000,
    disabled: true,
  },

  {
    value: 'gpt-4o',
    label: 'gpt-4o',
    provider: 'OpenAI',
    description:
      'GPT-4o from OpenAI has broad general knowledge and domain expertise allowing it to follow complex instructions in natural language and solve difficult problems accurately. It matches GPT-4 Turbo performance with a faster and cheaper API.',
    context: 128000,
  },
  {
    value: 'gpt-4o-mini',
    label: 'gpt-4o-mini',
    provider: 'OpenAI',
    description:
      'GPT-4o mini from OpenAI is their most advanced and cost-efficient small model. It is multi-modal (accepting text or image inputs and outputting text) and has higher intelligence than gpt-3.5-turbo but is just as fast.',
    context: 128000,
  },
].sort(
  // Sort by provider (ones that have all models disabled should be at the end)
  (a, b) => {
    if (a.disabled && b.disabled) return 0;
    if (a.disabled) return 1;
    if (b.disabled) return -1;
    return a.provider.localeCompare(b.provider);
  }
);

const fallbackModel = models.find((model) => !model.disabled);
export const defaultModel =
  models.find(
    (model) =>
      model.value === 'gemini-2.0-flash-001' &&
      model.provider === 'Google Vertex'
  ) || fallbackModel;

export const providers = models.reduce((acc, model) => {
  if (!acc.includes(model.provider)) acc.push(model.provider);
  return acc;
}, [] as Provider[]);

export type Model = (typeof models)[number];
export type ModelName = Model['value'];

export type Provider = (typeof models)[number]['provider'];
