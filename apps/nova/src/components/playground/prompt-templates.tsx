import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ChevronDown } from '@tuturuuu/ui/icons';

const templates = [
  {
    name: 'Summarization',
    prompt: 'Summarize the following text in 3-5 sentences: [INSERT TEXT HERE]',
  },
  {
    name: 'Sentiment Analysis',
    prompt:
      'Analyze the sentiment of the following text and classify it as positive, negative, or neutral: [INSERT TEXT HERE]',
  },
  {
    name: 'Code Explanation',
    prompt:
      'Explain the following code in simple terms, suitable for a beginner programmer: [INSERT CODE HERE]',
  },
];

interface PromptTemplatesProps {
  onSelectTemplate: (prompt: string) => void;
}

export function PromptTemplates({ onSelectTemplate }: PromptTemplatesProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          Templates <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Prompt Templates</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {templates.map((template, index) => (
          <DropdownMenuItem
            key={index}
            onClick={() => onSelectTemplate(template.prompt)}
          >
            {template.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
