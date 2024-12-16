export const models: {
  value: string;
  label: string;
  provider: string;
  description?: string;
  context?: number;
  disabled?: boolean;
}[] = [
  {
    value: 'gemini-2.0-flash-exp',
    label: 'gemini-2.0-flash',
    provider: 'Google',
    description:
      'Gemini 2.0 Flash delivers next-gen features and improved capabilities, including superior speed, native tool use, multimodal generation, and a 1M token context window.',
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
    value: 'gemini-2.0-flash-exp',
    label: 'gemini-2.0-flash',
    provider: 'Google Vertex',
    description:
      'Gemini 2.0 Flash delivers next-gen features and improved capabilities, including superior speed, native tool use, multimodal generation, and a 1M token context window.',
    context: 1000000,
    disabled: true,
  },
  {
    value: 'gemini-1.5-flash',
    label: 'gemini-1.5-flash',
    provider: 'Google Vertex',
    description:
      "Gemini 1.5 Flash is the latest model of the Gemini family. It's a multimodal model that supports up to 1 million tokens. It is optimized for speed and efficiency.",
    context: 1000000,
  },
  {
    value: 'gemini-1.5-pro',
    label: 'gemini-1.5-pro',
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
  },
  {
    value: 'claude-3-5-haiku-latest',
    label: 'claude-3.5-haiku (latest)',
    provider: 'Anthropic',
    description:
      'Claude 3.5 Haiku is a high-performance model that excels at generating high-quality text. It is ideal for tasks that require a high level of creativity and language understanding.',
    context: 200000,
  },

  {
    value: 'command-light-nightly',
    label: 'command-light-nightly',
    provider: 'Cohere',
    description:
      "A smaller and faster version of Cohere's command model with almost as much capability but improved speed.",
    context: 4096,
    disabled: true,
  },
  {
    value: 'command-nightly',
    label: 'command-nightly',
    provider: 'Cohere',
    description:
      'An instruction-following conversational model by Cohere that performs language tasks with high quality and reliability while providing longer context compared to generative models.',
    context: 4096,
    disabled: true,
  },

  {
    value: 'dbrx-instruct',
    label: 'dbrx-instruct',
    provider: 'Fireworks',
    description:
      'DBRX Instruct is a mixture-of-experts (MoE) large language model trained from scratch by Databricks. DBRX Instruct specializes in few-turn interactions. Dbrx is hosted as an experimental model.',
    context: 32768,
    disabled: true,
  },
  {
    value: 'firefunction-v1',
    label: 'firefunction-v1',
    provider: 'Fireworks',
    description:
      'Fireworks’ GPT-4-level function calling model - 4x faster than GPT-4 and open weights.',
    context: 32768,
    disabled: true,
  },

  {
    value: 'llama-2-7b-chat',
    label: 'llama-2-7b-chat',
    provider: 'Meta',
    description:
      '7 billion parameter open source model by Meta fine-tuned for chat purposes served by Fireworks. LLaMA v2 was trained on more data (~2 trillion tokens) compared to LLaMA v1 and supports context windows up to 4k tokens.',
    context: 4096,
    disabled: true,
  },
  {
    value: 'llama-2-13b-chat',
    label: 'llama-2-13b-chat',
    provider: 'Meta',
    description:
      '13 billion parameter open source model by Meta fine-tuned for chat purposes served by Fireworks. LLaMA v2 was trained on more data (~2 trillion tokens) compared to LLaMA v1 and supports context windows up to 4k tokens.',
    context: 4096,
    disabled: true,
  },
  {
    value: 'llama-2-70b-chat',
    label: 'llama-2-70b-chat',
    provider: 'Meta',
    description:
      '70 billion parameter open source model by Meta fine-tuned for chat purposes served by Fireworks. LLaMA v2 was trained on more data (~2 trillion tokens) compared to LLaMA v1 and supports context windows up to 4k tokens.',
    context: 4096,
    disabled: true,
  },
  {
    value: 'llama-2-7b-chat-groq',
    label: 'llama-2-7b-chat-groq',
    provider: 'Meta',
    description:
      '70 billion parameter open source model by Meta fine-tuned for chat purposes served by Groq. Groq uses custom Language Processing Units (LPUs) hardware to provide fast and efficient inference.',
    context: 4096,
    disabled: true,
  },
  {
    value: 'codellama-34b-instruct',
    label: 'codellama-34b-instruct',
    provider: 'Meta',
    description:
      'Code Llama is a 34 billion parameter open source model by Meta fine-tuned for instruction following purposes served by Perplexity.',
    context: 16384,
    disabled: true,
  },
  {
    value: 'codellama-70b-instruct',
    label: 'codellama-70b-instruct',
    provider: 'Meta',
    description:
      'Code Llama is a 70 billion parameter open source model by Meta fine-tuned for instruction following purposes served by Perplexity.',
    context: 16384,
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
    value: 'llama-3-8b-instruct-groq',
    label: 'llama-3-8b-instruct-groq',
    provider: 'Meta',
    description:
      'Llama is a 8 billion parameter open source model by Meta fine-tuned for instruction following purposes served by Groq on their LPU hardware.',
    context: 8192,
    disabled: true,
  },
  {
    value: 'llama-3-70b-instruct-groq',
    label: 'llama-3-70b-instruct-groq',
    provider: 'Meta',
    description:
      'Llama is a 70 billion parameter open source model by Meta fine-tuned for instruction following purposes served by Groq on their LPU hardware.',
    context: 8192,
    disabled: true,
  },
  {
    value: 'llama-3-sonar-small-32k-chat',
    label: 'llama-3-sonar-small-32k-chat',
    provider: 'Meta',
    description:
      "Llama 3 Sonar is a 7 Billion parameter model based on Meta's Llama 3 model. It is fine-tuned for chat completions and served by Perplexity.",
    context: 32768,
    disabled: true,
  },
  {
    value: 'llama-3-sonar-large-32k-chat',
    label: 'llama-3-sonar-large-32k-chat',
    provider: 'Meta',
    description:
      "Llama 3 Sonar is an 8x7B parameter model based on Meta's Llama 3 model. It is fine-tuned for chat completions and served by Perplexity.",
    context: 32768,
    disabled: true,
  },
  {
    value: 'llama-3-sonar-small-32k-online',
    label: 'llama-3-sonar-small-32k-online',
    provider: 'Meta',
    description:
      "Llama 3 Sonar Online is a 7 Billion parameter model based on Meta's Llama 3 model. It is fine-tuned for chat completions and served by Perplexity. The model has access to recent internet knowledge when forming responses.",
    context: 28000,
    disabled: true,
  },
  {
    value: 'llama-3-sonar-large-32k-online',
    label: 'llama-3-sonar-large-32k-online',
    provider: 'Meta',
    description:
      "Llama 3 Sonar Online is an 8x7B parameter model based on Meta's Llama 3 model. It is fine-tuned for chat completions and served by Perplexity. The model has access to recent internet knowledge when forming responses.",
    context: 28000,
    disabled: true,
  },

  {
    value: 'mistral-7b-instruct-4k',
    label: 'mistral-7b-instruct-4k',
    provider: 'Mistral',
    description:
      'The Mistral-7B-Instruct-v0.1 Large Language Model (LLM) is a instruct fine-tuned version of the Mistral-7B-v0.1 served by Fireworks.',
    context: 4096,
    disabled: true,
  },
  {
    value: 'mixtral-8x7b',
    label: 'mixtral-8x7b',
    provider: 'Mistral',
    description:
      'Mistral MoE LLM model with 8 experts, each 7B. Warning: unofficial implementation + served by Fireworks.',
    context: 4096,
    disabled: true,
  },
  {
    value: 'mixtral-8x7b-groq',
    label: 'mixtral-8x7b-groq',
    provider: 'Mistral',
    description:
      'Mistral MoE LLM model with 8 experts, each 7B. Warning: unofficial implementation + served by Groq. served by Groq. Groq uses custom Language Processing Units (LPUs) hardware to provide fast and efficient inference.',
    context: 21845,
    disabled: true,
  },
  {
    value: 'mixtral-8x22b-instruct',
    label: 'mixtral-8x22b-instruct',
    provider: 'Mistral',
    description:
      '8x22b Instruct model. 8x22b is mixture-of-experts open source model by Mistral served by Fireworks.',
    context: 2048,
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
    value: 'gpt-4-turbo',
    label: 'gpt-4-turbo',
    provider: 'OpenAI',
    description:
      'gpt-4-turbo from OpenAI has broad general knowledge and domain expertise allowing it to follow complex instructions in natural language and solve difficult problems accurately. It has a knowledge cutoff of April 2023 and a 128,000 token context window.',
    context: 128000,
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
  models.find((model) => model.value === 'gemini-2.0-flash-exp') ||
  fallbackModel;

export const providers = models.reduce((acc, model) => {
  if (!acc.includes(model.provider)) acc.push(model.provider);
  return acc;
}, [] as Provider[]);

export type Model = (typeof models)[number];
export type ModelName = Model['value'];

export type Provider = (typeof models)[number]['provider'];
