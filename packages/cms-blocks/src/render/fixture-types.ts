import type { CmsBlock, CmsBlockPropsOf } from '../schema';

/** Synthetic preview types only. Replace with the editor-owned schemas before public registration. */
export type SectionFixtureProps = {
  id: string; width: 'narrow' | 'wide' | 'full'; content: CmsBlock[];
};
export type HeadingFixtureProps = { id: string; text: string; level: 1 | 2 | 3 | 4 | 5 | 6 };
export type GalleryFixtureProps = {
  id: string; columns: 2 | 3 | 4;
  images: { src: string; alt: string; caption?: string }[];
};
export type VideoEmbedFixtureProps =
  | { id: string; kind: 'video'; src: string; title: string; captionsSrc: string; captionsLanguage: string }
  | { id: string; kind: 'embed'; src: string; title: string };
export type AccordionFixtureProps = {
  id: string; items: { title: string; doc: CmsBlockPropsOf<'RichText'>['doc'] }[];
};
export type DividerFixtureProps = { id: string };
