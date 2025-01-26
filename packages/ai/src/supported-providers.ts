export const supportedProviders = [
  'google',
  'google-vertex',
  'openai',
  'anthropic',
];

export type SupportedAIProviders = (typeof supportedProviders)[number];
