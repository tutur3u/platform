import { CheckCircle2, Lightbulb, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useState } from 'react';
import { useCopy } from './i18n';
import { SelectField } from './select-field';

const clues: Record<string, RegExp> = {
  role: /\b(role|audience|readers|you are|act as|students)\b|vai trò|người đọc|bạn là|sinh viên/iu,
  inputs:
    /\b(source|evidence|approved|verify|read|context)\b|nguồn|bằng chứng|đã duyệt|kiểm chứng|dữ kiện/iu,
  steps:
    /\b(first|then|steps|never|approval|ask|check)\b|quy trình|bước|không|trước|duyệt|kiểm tra/iu,
  output:
    /\b(output|return|format|caption|deliver|plain.text)\b|đầu ra|trả|định dạng|bài viết|văn bản thuần/iu,
  context:
    /\b(context|purpose|induction|event|goal)\b|bối cảnh|mục đích|sự kiện|mục tiêu/iu,
  action:
    /\b(read|draft|write|verify|compare|check|search)\b|đọc|viết|kiểm chứng|đối chiếu|tìm/iu,
  format:
    /\b(format|return|paragraph|caption|markdown|plain.text|words)\b|định dạng|trả|đoạn|văn bản|từ/iu,
  tone: /\b(tone|warm|friendly|inclusive|voice|welcoming)\b|giọng|ấm áp|thân thiện|hòa nhập|gần gũi/iu,
};

/** Transparent structural hints, never a model-quality score. */
export function promptEvidence(prompt: string, section: string) {
  return (
    prompt
      .split(/\n|(?<=[.!?])\s+/u)
      .filter((line) => !/^\s*#/.test(line))
      .find((line) => clues[section]?.test(line))
      ?.trim() ?? ''
  );
}

export function PromptAnalysis({
  prompt,
  onAdd,
}: {
  prompt: string;
  onAdd?: (text: string) => void;
}) {
  const c = useCopy().learning;
  const [framework, setFramework] = useState<'rise' | 'craft'>('rise');
  const sections = c.frameworks[framework].sections;
  return (
    <section className="prompt-analysis" aria-label={c.analyze}>
      <div className="analysis-heading">
        <div>
          <h3>
            <Lightbulb className="size-5" aria-hidden="true" />
            {c.analyze}
          </h3>
          <p>{c.analysisHelp}</p>
        </div>
        <SelectField
          label={c.frameworkLabel}
          value={framework}
          onValueChange={(value) =>
            setFramework(value === 'craft' ? 'craft' : 'rise')
          }
        >
          <option value="rise">{c.frameworks.rise.name}</option>
          <option value="craft">{c.frameworks.craft.name}</option>
        </SelectField>
      </div>
      <p className="fine-print">{c.frameworkHelp}</p>
      {!prompt.trim() && <p className="notice">{c.emptyAnalysis}</p>}
      <div className="framework-map">
        {sections.map((section, index) => {
          const evidence = promptEvidence(prompt, section.id);
          return (
            <article key={section.id} data-covered={Boolean(evidence)}>
              <header>
                <span className="framework-number">{index + 1}</span>
                <h4>{section.title}</h4>
                {evidence && (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                )}
              </header>
              <p>{section.why}</p>
              <strong className="framework-status">
                {evidence ? c.found : c.missing}
              </strong>
              {evidence ? (
                <blockquote>{evidence}</blockquote>
              ) : (
                <p className="fine-print">{c.noEvidence}</p>
              )}
              <details>
                <summary>{c.suggestion}</summary>
                <pre>{section.sample}</pre>
                {onAdd && !evidence && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={prompt.length + section.sample.length + 2 > 12000}
                    onClick={() => onAdd(section.sample)}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {c.add}
                  </Button>
                )}
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
