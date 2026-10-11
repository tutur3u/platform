export interface HelpTopic {
  commands?: string[];
  description?: string;
  examples?: string[];
  options?: string[];
  usage: string;
}

export function formatHelp(topic: HelpTopic, heading: string) {
  return [
    heading,
    '',
    topic.description,
    '',
    `Usage: ${topic.usage}`,
    topic.commands?.length
      ? ['', 'Commands:', ...topic.commands.map((line) => `  ${line}`)]
      : [],
    topic.options?.length
      ? ['', 'Options:', ...topic.options.map((line) => `  ${line}`)]
      : [],
    topic.examples?.length
      ? ['', 'Examples:', ...topic.examples.map((line) => `  ${line}`)]
      : [],
  ]
    .flat()
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n');
}
