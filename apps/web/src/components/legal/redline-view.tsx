import type { LegalLocale, LegalSectionDiff } from '@tuturuuu/legal';
import { changeCopy } from './change-copy';
import { LegalMarkdown } from './legal-markdown';
export function RedlineView({
  change,
  locale,
}: {
  change: LegalSectionDiff;
  locale: LegalLocale;
}) {
  const copy = changeCopy[locale];
  return (
    <div className="legal-redline">
      {change.parts.map((part, index) => {
        const text = (
          <div key={`text-${index}`} data-legal-part={part.kind}>
            {part.text.match(/^\s*/u)?.[0]}
            <LegalMarkdown>{part.text.trim()}</LegalMarkdown>
            {part.text.match(/\s*$/u)?.[0]}
          </div>
        );
        if (part.kind === 'unchanged') return <div key={index}>{text}</div>;
        const label = (
          <span key={`label-${index}`} className="sr-only">
            {part.kind === 'removed' ? copy.removed : copy.added}:{' '}
          </span>
        );
        return part.kind === 'removed' ? (
          <del key={index}>
            {label}
            {text}
          </del>
        ) : (
          <ins key={index}>
            {label}
            {text}
          </ins>
        );
      })}
    </div>
  );
}
