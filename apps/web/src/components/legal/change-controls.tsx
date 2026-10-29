'use client';
import type { LegalLocale } from '@tuturuuu/legal';
import { useEffect, useState } from 'react';
import { changeCopy } from './change-copy';
export function ChangeControls({
  locale,
  full,
}: {
  locale: LegalLocale;
  full: boolean;
}) {
  const copy = changeCopy[locale];
  return (
    <div className="change-actions">
      <a
        href={`${locale === 'vi' ? '/vi' : ''}/legal/changes${full ? '' : '/full'}`}
      >
        {full ? copy.contents : copy.compare}
      </a>
      <button type="button" onClick={() => window.print()}>
        {copy.print}
      </button>
      <nav aria-label="Language">
        <a
          href={`/en/legal/changes${full ? '/full' : ''}`}
          hrefLang="en"
          aria-current={locale === 'en' ? 'page' : undefined}
          onClick={(e) => {
            e.currentTarget.hash = window.location.hash;
          }}
        >
          EN
        </a>
        <a
          href={`/vi/legal/changes${full ? '/full' : ''}`}
          hrefLang="vi"
          aria-current={locale === 'vi' ? 'page' : undefined}
          onClick={(e) => {
            e.currentTarget.hash = window.location.hash;
          }}
        >
          VI
        </a>
      </nav>
    </div>
  );
}
export function ChangeToc({
  locale,
  items,
}: {
  locale: LegalLocale;
  items: { id: string; title: string }[];
}) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: '-10% 0px -65% 0px' }
    );
    for (const item of items) {
      const node = document.getElementById(item.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [items]);
  const links = items.map((item) => (
    <a
      key={item.id}
      href={`#${item.id}`}
      aria-current={active === item.id ? 'location' : undefined}
    >
      {item.title}
    </a>
  ));
  return (
    <aside className="change-toc">
      <nav aria-label={changeCopy[locale].contents}>
        <div className="desktop-contents">
          <strong>{changeCopy[locale].contents}</strong>
          {links}
        </div>
        <details className="mobile-contents">
          <summary>{changeCopy[locale].contents}</summary>
          {links}
        </details>
      </nav>
    </aside>
  );
}
