import { z } from 'zod';

const optionalText = z.string().trim().max(2000).optional();

export const citationFieldsSchema = z.object({
  type: z.enum(['book', 'article-journal', 'webpage']),
  title: z.string().trim().min(1).max(2000),
  authors: z
    .array(
      z.object({
        family: z.string().trim().min(1).max(200),
        given: z.string().trim().max(200).optional(),
      })
    )
    .max(100),
  year: z.number().int().min(1).max(9999).optional(),
  publisher: optionalText,
  publisherPlace: optionalText,
  containerTitle: optionalText,
  volume: optionalText,
  issue: optionalText,
  pages: optionalText,
  DOI: optionalText,
  URL: optionalText,
  ISBN: optionalText,
  accessed: z.iso.date().optional(),
});

export type CitationFields = z.infer<typeof citationFieldsSchema>;
export type CitationStyle = 'apa' | 'harvard';
export type FormattedCitation = { reference: string; inText: string };
