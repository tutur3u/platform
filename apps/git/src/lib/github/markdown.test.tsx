import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RepositoryMarkdown } from '../../components/repository/repository-markdown';
import {
  resolveRepositoryMarkdownImage,
  resolveRepositoryMarkdownLink,
} from './markdown';

const context = {
  owner: 'tutur3u',
  refName: 'main',
  repository: 'platform',
  sourcePath: 'README.md',
};

describe('repository Markdown URLs', () => {
  it('routes relative file links through the native blob view', () => {
    expect(resolveRepositoryMarkdownLink('./SECURITY.md', context)).toBe(
      '/tutur3u/platform/blob/SECURITY.md?ref=main'
    );
  });

  it('resolves repository-root images through raw GitHub content', () => {
    expect(
      resolveRepositoryMarkdownImage(
        '/public/tuturuuu-marketing-hero.png',
        context
      )
    ).toBe(
      'https://raw.githubusercontent.com/tutur3u/platform/main/public/tuturuuu-marketing-hero.png'
    );
  });

  it('preserves safe external links and rejects unsafe protocols', () => {
    expect(
      resolveRepositoryMarkdownLink('https://docs.tuturuuu.com', context)
    ).toBe('https://docs.tuturuuu.com');
    expect(resolveRepositoryMarkdownLink('javascript:alert(1)', context)).toBe(
      ''
    );
  });
});

describe('RepositoryMarkdown', () => {
  it('renders GitHub-flavored tables and omits HTML comments', () => {
    const html = renderToStaticMarkup(
      createElement(
        RepositoryMarkdown,
        { context },
        '<!-- generated:start -->\n\n| Track | Done |\n| --- | ---: |\n| Web | 42 |\n'
      )
    );

    expect(html).toContain('<table');
    expect(html).toContain('>42</td>');
    expect(html).not.toContain('generated:start');
  });
});
