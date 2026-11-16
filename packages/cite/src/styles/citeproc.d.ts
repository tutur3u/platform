declare module 'citeproc' {
  type Item = { id: string; type: string; title?: string };
  type CitationItem = {
    id: string;
    locator?: string;
    label?: string;
    'suppress-author'?: boolean;
    prefix?: string;
    suffix?: string;
  };
  type Citation = {
    citationID: string;
    citationItems: CitationItem[];
    properties: { noteIndex: number };
  };
  class Engine {
    constructor(
      system: {
        retrieveLocale(language: string): string;
        retrieveItem(id: string): Item;
      },
      style: string,
      language?: string,
      forceLanguage?: boolean
    );
    setOutputFormat(format: 'text' | 'html'): void;
    updateItems(ids: string[]): void;
    makeBibliography(): [{ entry_ids: string[][] }, string[]] | false;
    makeCitationCluster(items: CitationItem[]): string;
    processCitationCluster(
      citation: Citation,
      citationsPre: [string, number][],
      citationsPost: [string, number][]
    ): [unknown, [number, string, string][]];
  }
  const CSL: { Engine: typeof Engine };
  export default CSL;
}
