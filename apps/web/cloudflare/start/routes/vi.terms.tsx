import { createFileRoute } from '@tanstack/react-router';
import { LegalPage, legalDocument } from '../legal-page';

export const Route = createFileRoute('/vi/terms')({
  head: () => {
    const document = legalDocument('terms', 'vi');
    return {
      meta: [
        { title: document.title + ' ' + document.highlightedWord },
        { name: 'description', content: document.summaryDescription },
      ],
    };
  },
  component: () => <LegalPage kind="terms" locale="vi" />,
});
