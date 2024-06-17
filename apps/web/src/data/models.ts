export const models: {
  value: string;
  label: string;
  provider: string;
  description?: string;
  context?: number;
  disabled?: boolean;
}[] = [
  {
    value: 'gemini-1.0-pro',
    label: 'gemini-1.0-pro',
    provider: 'Google',
    description:
      "Gemini 1.0 Pro is the first api-ready model of the Gemini family. It's a small multimodal model that supports up to 30k tokens and excels at short-context tasks.",
    context: 30720,
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
    context: 1000000,
  },

  {
    value: 'claude-instant-1.2',
    label: 'claude-instant-1.2',
    provider: 'Anthropic',
    description:
      'A faster, cheaper yet still very capable version of Claude, which can handle a range of tasks including casual dialogue, text analysis, summarization, and document comprehension.',
    context: 100000,
    disabled: true,
  },
  {
    value: 'claude-1',
    label: 'claude-1',
    provider: 'Anthropic',
    description:
      "An older version of Anthropic's Claude model that excels at a wide range of tasks from sophisticated dialogue and creative content generation to detailed instruction. It is good for complex reasoning, creativity, thoughtful dialogue, coding, and detailed content creation.",
    context: 100000,
    disabled: true,
  },
  {
    value: 'claude-2',
    label: 'claude-2',
    provider: 'Anthropic',
    description:
      "Anthropic's most powerful model that excels at a wide range of tasks from sophisticated dialogue and creative content generation to detailed instruction. It is good for complex reasoning, creativity, thoughtful dialogue, coding,and detailed content creation.",
    context: 100000,
    disabled: true,
  },
  {
    value: 'claude-3-opus',
    label: 'claude-3-opus',
    provider: 'Anthropic',
    description:
      "Claude 3 Opus is Anthropic's most intelligent model, with best-in-market performance on highly complex tasks. It can navigate open-ended prompts and sight-unseen scenarios with remarkable fluency and human-like understanding. Opus shows us the outer limits of what’s possible with generative AI.",
    context: 200000,
    disabled: true,
  },
  {
    value: 'claude-3-sonnet',
    label: 'claude-3-sonnet',
    provider: 'Anthropic',
    description:
      'Claude 3 Sonnet strikes the ideal balance between intelligence and speed—particularly for enterprise workloads. It delivers strong performance at a lower cost compared to its peers, and is engineered for high endurance in large-scale AI deployments.',
    context: 200000,
    disabled: true,
  },
  {
    value: 'claude-3-haiku',
    label: 'claude-3-haiku',
    provider: 'Anthropic',
    description:
      "Claude 3 Haiku is Anthropic's fastest model yet, designed for enterprise workloads which often involve longer prompts. Haiku to quickly analyze large volumes of documents, such as quarterly filings, contracts, or legal cases, for half the cost of other models in its performance tier.",
    context: 200000,
    disabled: true,
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
    value: 'gemma-2b-it',
    label: 'gemma-2b-it',
    provider: 'Google',
    description:
      'Gemma is a family of lightweight, state-of-the-art open models built from the same research and technology used to create the Gemini models.',
    context: 8000,
    disabled: true,
  },
  {
    value: 'gemma-7b-it',
    label: 'gemma-7b-it',
    provider: 'Google',
    description:
      'Gemma is a family of lightweight, state-of-the-art open models built from the same research and technology used to create the Gemini models.',
    context: 8000,
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
    value: 'gpt-4',
    label: 'gpt-4',
    provider: 'OpenAI',
    description:
      'GPT-4 from OpenAI has broad general knowledge and domain expertise allowing it to follow complex instructions in natural language and solve difficult problems accurately.',
    context: 8192,
    disabled: true,
  },
  {
    value: 'gpt-4-0613',
    label: 'gpt-4-0613',
    provider: 'OpenAI',
    description:
      'Snapshot of gpt-4 from June 13th 2023 with function calling data. Unlike gpt-4, this model does not receive updates, and is deprecated 3 months after a new version is released.',
    context: 8192,
    disabled: true,
  },
  {
    value: 'gpt-4-1106-preview',
    label: 'gpt-4-1106-preview',
    provider: 'OpenAI',
    description:
      'The latest GPT-4 model with improved instruction following, JSON mode, reproducible outputs, parallel function calling, and more. Returns a maximum of 4,096 output tokens. This preview model is not yet suited for production traffic.',
    context: 128000,
    disabled: true,
  },
  {
    value: 'gpt-4-turbo',
    label: 'gpt-4-turbo',
    provider: 'OpenAI',
    description:
      'gpt-4-turbo from OpenAI has broad general knowledge and domain expertise allowing it to follow complex instructions in natural language and solve difficult problems accurately. It has a knowledge cutoff of April 2023 and a 128,000 token context window.',
    context: 128000,
    disabled: true,
  },
  {
    value: 'gpt-4o',
    label: 'gpt-4o',
    provider: 'OpenAI',
    description:
      'GPT-4o from OpenAI has broad general knowledge and domain expertise allowing it to follow complex instructions in natural language and solve difficult problems accurately. It matches GPT-4 Turbo performance with a faster and cheaper API.',
    context: 128000,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo',
    label: 'gpt-3.5-turbo',
    provider: 'OpenAI',
    description:
      "OpenAI's most capable and cost effective model in the GPT-3.5 family optimized for chat purposes, but also works well for traditional completions tasks.",
    context: 4096,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo-1106',
    label: 'gpt-3.5-turbo-1106',
    provider: 'OpenAI',
    description:
      'The latest GPT-3.5 Turbo model with improved instruction following, JSON mode, reproducible outputs, parallel function calling, and more. Returns a maximum of 4,096 output tokens.',
    context: 16384,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo-16k',
    label: 'gpt-3.5-turbo-16k',
    provider: 'OpenAI',
    description:
      'Same capabilities as the standard gpt-3.5-turbo model but with 4 times the context.',
    context: 16384,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo-16k-0613',
    label: 'gpt-3.5-turbo-16k-0613',
    provider: 'OpenAI',
    description:
      'Snapshot of gpt-3.5-turbo-16k from June 13th 2023. Unlike gpt-3.5-turbo-16k, this model does not receive updates, and will be deprecated 3 months after a new version is released.',
    context: 16384,
    disabled: true,
  },
  {
    value: 'gpt-3.5-turbo-instruct',
    label: 'gpt-3.5-turbo-instruct',
    provider: 'OpenAI',
    description:
      'Similar capabilities as GPT-3 era models. Compatible with legacy Completions endpoint and not Chat Completions.',
    context: 4096,
    disabled: true,
  },
] as const;

const fallbackModel = models.find((model) => !model.disabled);
export const defaultModel =
  models.find((model) => model.value === 'gemini-1.5-flash') || fallbackModel;

export const providers = models.reduce((acc, model) => {
  if (!acc.includes(model.provider)) acc.push(model.provider);
  return acc;
}, [] as Provider[]);

export type Model = (typeof models)[number];
export type ModelName = Model['value'];

export type Provider = (typeof models)[number]['provider'];
