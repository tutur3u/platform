import { PromptTemplates } from './prompt-templates';
import { Button } from '@tuturuuu/ui/button';
import { CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { RotateCcw, Send, Sparkles } from '@tuturuuu/ui/icons';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';

interface PromptInputProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onSubmit: () => void;
  onGenerate: () => void;
  isLoading: boolean;
}

export function PromptInput({
  prompt,
  setPrompt,
  onSubmit,
  onGenerate,
  isLoading,
}: PromptInputProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const handleSubmit = () => {
    if (prompt.trim() !== '') {
      setHistory([prompt, ...history]);
      setHistoryIndex(-1);
      onSubmit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setPrompt(history[newIndex] as string);
      }
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setPrompt(history[newIndex] as string);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setPrompt('');
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">
          Prompt Engineering Workbench
        </CardTitle>
      </CardHeader>
      <CardContent className="flex grow flex-col">
        <Textarea
          className="mb-4 grow resize-none"
          placeholder="Enter your prompt here..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center justify-between">
          <div className="space-x-2">
            <PromptTemplates onSelectTemplate={setPrompt} />
            <Button onClick={onGenerate} variant="outline" className="gap-2">
              <Sparkles className="h-4 w-4" /> Generate Prompt
            </Button>
            <Button
              onClick={() => setPrompt('')}
              variant="outline"
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" /> Clear
            </Button>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || prompt.trim() === ''}
            className="gap-2"
          >
            <Send className="h-4 w-4" />{' '}
            {isLoading ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </CardContent>
    </div>
  );
}
