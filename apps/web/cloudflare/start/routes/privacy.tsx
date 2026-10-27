import { createFileRoute } from '@tanstack/react-router';
import { LegalPage, legalDocument } from '../legal-page';

export const Route = createFileRoute('/privacy')({
  head: () => {
    const document = legalDocument('privacy', 'en');
    return {
      meta: [
        { title: document.title + ' ' + document.highlightedWord },
        { name: 'description', content: document.summaryDescription },
      ],
    };
  },
  component: () => <LegalPage kind="privacy" locale="en" />,
});
