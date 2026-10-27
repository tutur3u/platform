import { createFileRoute } from '@tanstack/react-router';
import { LegalPage, legalDocument } from '../legal-page';

export const Route = createFileRoute('/en/terms')({
  head: () => {
    const document = legalDocument('terms', 'en');
    return {
      meta: [
        { title: document.title + ' ' + document.highlightedWord },
        { name: 'description', content: document.summaryDescription },
      ],
    };
  },
  component: () => <LegalPage kind="terms" locale="en" />,
});
