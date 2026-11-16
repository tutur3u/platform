import type { CitationStyle, CiteWork } from './model';

export type CitationValidationIssue = {
  severity: 'error' | 'warning';
  field: string;
  code: 'required' | 'recommended' | 'unverified-source' | 'protocol-review';
  message: string;
};

export const PHASE1_SOURCE_TYPES = [
  'book',
  'book-chapter',
  'edited-book',
  'journal-article',
  'newspaper-article',
  'magazine-article',
  'conference-paper',
  'webpage',
  'web-document',
  'blog-post',
  'report',
  'dataset',
  'thesis',
  'standard',
  'indigenous-knowledge',
  'ai-generated',
  'software',
] as const;

export function validateCitation(
  work: CiteWork,
  style: CitationStyle
): CitationValidationIssue[] {
  const issues: CitationValidationIssue[] = [];
  const required = (field: string, present: unknown, message: string) => {
    if (!present)
      issues.push({ severity: 'error', field, code: 'required', message });
  };
  if (!work.authors.length && !work.editors.length)
    issues.push({
      severity: 'warning',
      field: 'authors',
      code: 'recommended',
      message: 'Confirm that this work has no named author or organization.',
    });
  if (!work.issued)
    issues.push({
      severity: 'warning',
      field: 'issued',
      code: 'recommended',
      message: 'Confirm the publication date or explicitly select no date.',
    });
  if (
    [
      'journal-article',
      'newspaper-article',
      'magazine-article',
      'book-chapter',
      'conference-paper',
    ].includes(work.type)
  )
    required(
      'containerTitle',
      work.containerTitle,
      'A journal, publication, book or proceedings title is required.'
    );
  if (['book', 'edited-book', 'book-chapter', 'report'].includes(work.type))
    required(
      'publisher',
      work.publisher,
      'The publisher or issuing organization is required.'
    );
  if (
    style === 'harvard' &&
    ['book', 'edited-book', 'book-chapter'].includes(work.type) &&
    !work.doi
  )
    required(
      'publisherPlace',
      work.publisherPlace,
      'Harvard books without a DOI require a publication place.'
    );
  if (
    [
      'webpage',
      'web-document',
      'blog-post',
      'social-post',
      'ai-generated',
    ].includes(work.type)
  ) {
    required(
      'url',
      work.url ?? work.aiGenerated?.promptShareUrl,
      'A source or share URL is required.'
    );
    if (style === 'harvard')
      required(
        'accessed',
        work.accessed,
        'Harvard web sources require an accessed date.'
      );
  }
  if (work.type === 'dataset')
    required(
      'publisher',
      work.publisher ?? work.archive,
      'A dataset publisher or repository is required.'
    );
  if (work.type === 'ai-generated')
    required(
      'aiGenerated.modelName',
      work.aiGenerated?.modelName,
      'An AI-generated source requires the model name.'
    );
  if (work.type === 'indigenous-knowledge') {
    if (!work.indigenous?.nationOrCommunity || !work.indigenous.protocolNote)
      issues.push({
        severity: 'warning',
        field: 'indigenous',
        code: 'protocol-review',
        message:
          'Confirm community attribution and the permitted use of this knowledge with its knowledge holder.',
      });
  }
  if (work.provenance.verificationStatus === 'ai_inferred')
    issues.push({
      severity: 'warning',
      field: 'provenance',
      code: 'unverified-source',
      message:
        'AI-inferred metadata requires review against the original source.',
    });
  return issues;
}
