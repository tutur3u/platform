import { Check, Copy } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import { answerSections, sectionTitle } from './answer-sections';
import { useCopy } from './i18n';

export function AgentAnswer({
  answer,
  renderText,
}: {
  answer: string;
  renderText: (text: string) => React.ReactNode;
}) {
  const c = useCopy();
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const sections = answerSections(answer) ?? [
    { key: 'answer', content: answer },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {sections.map(({ key, content }) => (
        <section key={key} className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">
              {key === 'answer' ? c.agentAnswer : sectionTitle(key)}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(content);
                  setCopied(key);
                  setFailed(false);
                } catch {
                  setCopied(null);
                  setFailed(true);
                }
              }}
            >
              {copied === key ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied === key ? c.answerCopied : c.copyAnswerSection}
            </Button>
          </div>
          <div className="readable-output whitespace-pre-wrap break-words">
            {renderText(content)}
          </div>
        </section>
      ))}
      {failed && <p role="alert">{c.answerCopyFailed}</p>}
    </div>
  );
}
