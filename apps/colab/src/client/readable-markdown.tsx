import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import remarkGfm from 'remark-gfm';

/** CommonMark plus tables, checklists, links and safe authenticated room images. */
export function ReadableMarkdown({ text }: { text: string }) {
  return (
    <div className="colab-markdown">
      <MemoizedReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </MemoizedReactMarkdown>
    </div>
  );
}
