import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  Layers,
  Search,
  Sparkles,
  Users,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useState } from 'react';
import { useCopy } from './i18n';
import { WorkspaceLink } from './navigation';
import { PromptAnalysis } from './prompt-analysis';
import { ReadableMarkdown } from './readable-markdown';
import './learning.css';

const icons = [Sparkles, FileText, Users, Layers, Search, Check];

export function Learning({ inRoom = false }: { inRoom?: boolean }) {
  const c = useCopy().learning;
  const [lesson, setLesson] = useState(0);
  const [explored, setExplored] = useState<number[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem('colab-learning-v1') ?? '[]'
      );
      return Array.isArray(saved)
        ? [
            ...new Set(
              saved.filter(
                (value): value is number =>
                  Number.isInteger(value) && value >= 0 && value < 6
              )
            ),
          ]
        : [];
    } catch {
      return [];
    }
  });
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [practicePrompt, setPracticePrompt] = useState('');
  const current = c.lessons[lesson]!;
  return (
    <section className="learning" aria-label={c.title}>
      <header className="learning-hero">
        <span className="section-number">{c.eyebrow}</span>
        <h2>{c.heading}</h2>
        <p>{c.intro}</p>
        <div className="learning-progress">
          <progress
            max={c.lessons.length}
            value={explored.length}
            aria-label={c.progress}
          />
          <span>
            {explored.length}/{c.lessons.length} {c.completed}
          </span>
        </div>
      </header>
      <ol className="learning-flow" aria-label={c.progress}>
        {c.flow.map((step, index) => (
          <li key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
            {index < c.flow.length - 1 && (
              <ArrowRight aria-hidden="true" className="size-4" />
            )}
          </li>
        ))}
      </ol>
      <div className="learning-layout">
        <nav className="learning-navigation" aria-label={c.progress}>
          {c.lessons.map((item, index) => {
            const Icon = icons[index] ?? BookOpen;
            return (
              <button
                type="button"
                key={item.title}
                aria-current={lesson === index ? 'step' : undefined}
                onClick={() => setLesson(index)}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span>{item.title}</span>
                {explored.includes(index) && (
                  <Check aria-hidden="true" className="size-4" />
                )}
              </button>
            );
          })}
        </nav>
        <article className="learning-lesson" aria-labelledby="lesson-heading">
          <header>
            <span className="section-number">
              {String(lesson + 1).padStart(2, '0')} / {c.lessons.length}
            </span>
            <h3 id="lesson-heading">{current.title}</h3>
            <p className="lesson-subtitle">{current.subtitle}</p>
          </header>
          <p>{current.body}</p>
          <div className="lesson-pair">
            <section>
              <h4>{c.why}</h4>
              <p>{current.why}</p>
            </section>
            <section>
              <h4>{c.example}</h4>
              <p>{current.example}</p>
            </section>
          </div>
          {lesson === 1 && (
            <section className="markdown-playground">
              <h4>{c.tryIt}</h4>
              <div className="lesson-pair">
                <label>
                  {c.source}
                  <Textarea
                    aria-label={c.markdownLabel}
                    value={markdown ?? c.markdownSample}
                    onChange={(event) => setMarkdown(event.target.value)}
                    maxLength={4000}
                    className="min-h-72 font-mono text-sm"
                  />
                </label>
                <div>
                  <h5>{c.preview}</h5>
                  <div className="learning-markdown">
                    <ReadableMarkdown text={markdown ?? c.markdownSample} />
                  </div>
                </div>
              </div>
              <p className="fine-print">{c.local}</p>
            </section>
          )}
          {lesson === 2 && (
            <section className="space-y-4">
              <h4>{c.tryIt}</h4>
              <Textarea
                value={practicePrompt}
                onChange={(event) => setPracticePrompt(event.target.value)}
                aria-label={c.analyze}
                placeholder={c.frameworks.rise.sections[0]!.sample}
                maxLength={12000}
              />
              <PromptAnalysis
                prompt={practicePrompt}
                onAdd={(text) =>
                  setPracticePrompt((value) =>
                    `${value.trim()}\n\n${text}`.trim()
                  )
                }
              />
              <p className="fine-print">{c.local}</p>
            </section>
          )}
          {lesson === 4 && <SourceMap />}
          <aside className="lesson-takeaway">
            <h4>{c.takeaway}</h4>
            <p>{current.takeaway}</p>
          </aside>
          <footer className="learning-actions">
            <Button
              variant="outline"
              disabled={lesson === 0}
              onClick={() => setLesson((value) => value - 1)}
            >
              {c.back}
            </Button>
            <Button
              variant="secondary"
              disabled={explored.includes(lesson)}
              onClick={() => {
                const next = [...new Set([...explored, lesson])];
                setExplored(next);
                try {
                  localStorage.setItem(
                    'colab-learning-v1',
                    JSON.stringify(next)
                  );
                } catch {}
              }}
            >
              <Check className="size-4" aria-hidden="true" />
              {c.mark}
            </Button>
            {lesson < c.lessons.length - 1 ? (
              <Button onClick={() => setLesson((value) => value + 1)}>
                {c.next}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : inRoom ? (
              <Button asChild>
                <WorkspaceLink href="#team-prompt">
                  {c.openPrompt}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </WorkspaceLink>
              </Button>
            ) : null}
          </footer>
        </article>
      </div>
    </section>
  );
}

export function SourceMap() {
  const c = useCopy().learning;
  return (
    <section className="source-map">
      <h4>{c.sourceMapTitle}</h4>
      <p>{c.sourceMapHelp}</p>
      <div className="source-map-grid">
        {c.sources.map((source) => (
          <article key={source.app}>
            <Search className="size-4" aria-hidden="true" />
            <strong>{source.name}</strong>
            <p>{source.question}</p>
            <small>{source.app}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
