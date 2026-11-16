import CSL from 'citeproc';
import apa from './styles/apa.csl.json';
import enGB from './styles/locales-en-GB.xml.json';
import enUS from './styles/locales-en-US.xml.json';
import harvard from './styles/rmit-university-harvard.csl.json';
import {
  type CitationFields,
  type CitationStyle,
  citationFieldsSchema,
  type FormattedCitation,
} from './types';

/** Formats one independent source; document-wide disambiguation is not applied. */
export function formatCitation(
  fields: CitationFields,
  style: CitationStyle
): FormattedCitation {
  const source = citationFieldsSchema.parse(fields);
  const item = {
    id: 'source',
    type: source.type,
    title: source.title,
    author: source.authors,
    ...(source.year ? { issued: { 'date-parts': [[source.year]] } } : {}),
    ...(source.accessed
      ? { accessed: { 'date-parts': [source.accessed.split('-').map(Number)] } }
      : {}),
    publisher: source.publisher,
    'publisher-place': source.publisherPlace,
    'container-title': source.containerTitle,
    volume: source.volume,
    issue: source.issue,
    page: source.pages,
    DOI: source.DOI,
    URL: source.URL,
    ISBN: source.ISBN,
  };
  const engine = new CSL.Engine(
    {
      retrieveLocale: (language) => (language === 'en-GB' ? enGB : enUS),
      retrieveItem: () => item,
    },
    style === 'apa' ? apa : harvard,
    style === 'apa' ? 'en-US' : 'en-GB',
    true
  );
  engine.setOutputFormat('text');
  engine.updateItems([item.id]);
  const bibliography = engine.makeBibliography();
  const reference = bibliography && bibliography[1][0];
  if (!reference) throw new Error('Citation formatting failed');
  return {
    reference: reference.trim(),
    inText: engine.makeCitationCluster([{ id: item.id }]).trim(),
  };
}
