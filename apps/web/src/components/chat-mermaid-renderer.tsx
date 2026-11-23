'use client';

import { LoadingRegion, Skeleton } from '@tuturuuu/ui/skeleton';
import mermaid from 'mermaid';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

export const MermaidRenderer = ({ content }: { content: string }) => {
  const tCommon = useTranslations('common');
  const elementRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isRendering, setIsRendering] = useState(false);
  const renderTimeoutRef = useRef<NodeJS.Timeout>(null);

  // Debounced rendering to prevent excessive re-renders during streaming
  const debouncedRender = useCallback(
    async (contentToRender: string) => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }

      renderTimeoutRef.current = setTimeout(async () => {
        if (isRendering) return;

        setIsRendering(true);
        try {
          const cleanContent = contentToRender
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '  ')
            .trim();

          // Only render if content looks complete (basic heuristic)
          if (
            !cleanContent ||
            cleanContent.endsWith('```') ||
            cleanContent.includes('▍')
          ) {
            setIsRendering(false);
            return;
          }

          mermaid.initialize({
            layout: 'dagre',
            look: 'classic',
            theme: 'default',
            startOnLoad: false,
            securityLevel: 'strict',
            themeVariables: {
              fontSize: '14px',
            },
            flowchart: {
              htmlLabels: true,
              curve: 'linear',
            },
          });

          // First try to parse the diagram
          await mermaid.parse(cleanContent);

          // If parsing succeeds, render it
          const { svg } = await mermaid.render(
            `mermaid-${Date.now()}`,
            cleanContent
          );
          setSvgContent(svg);
          setError('');
        } catch (error) {
          console.error('Mermaid rendering error:', error);
          setError(
            error instanceof Error ? error.message : 'Failed to render diagram'
          );
          setSvgContent('');
        } finally {
          setIsRendering(false);
        }
      }, 300); // 300ms debounce
    },
    [isRendering]
  );

  useEffect(() => {
    debouncedRender(content);

    return () => {
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [content, debouncedRender]);

  if (error) {
    return (
      <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
        <p className="font-semibold">Failed to render diagram:</p>
        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs">
          {error}
        </pre>
      </div>
    );
  }

  if (!svgContent) {
    return (
      <LoadingRegion srLabel={tCommon('loading')}>
        <Skeleton aria-hidden className="h-48 w-full rounded-lg" />
      </LoadingRegion>
    );
  }

  return (
    <div
      ref={elementRef}
      className="overflow-x-auto"
      // eslint-disable-next-line react/no-danger -- Only Mermaid output rendered with securityLevel strict reaches this sink.
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
};
