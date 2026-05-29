'use client';

import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { createMathPlugin } from '@streamdown/math';
import { mermaid as mermaidPlugin } from '@streamdown/mermaid';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Streamdown } from 'streamdown';

const math = createMathPlugin({ singleDollarTextMath: true });
const markdownPlugins = { code, mermaid: mermaidPlugin, math, cjk };

class AiMarkdownErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.setState({ hasError: true });
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function AssistantMarkdown({
  isAnimating,
  text,
}: {
  isAnimating?: boolean;
  text: string;
}) {
  return (
    <div className="wrap-break-word [&_pre]:overflow-x-hidden! [&_pre]:whitespace-pre-wrap! [&_pre_code]:whitespace-pre-wrap! min-w-0 max-w-full overflow-hidden [&_a]:break-all [&_pre]:max-w-full">
      <AiMarkdownErrorBoundary
        fallback={<p className="whitespace-pre-wrap">{text}</p>}
      >
        <Streamdown
          caret="block"
          controls={{ code: !isAnimating, mermaid: !isAnimating }}
          isAnimating={isAnimating}
          linkSafety={{ enabled: false }}
          plugins={markdownPlugins}
        >
          {text}
        </Streamdown>
      </AiMarkdownErrorBoundary>
    </div>
  );
}
