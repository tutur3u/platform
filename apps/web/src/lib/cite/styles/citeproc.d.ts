declare module 'citeproc' {
  type Item = {
    id: string;
    type: string;
    title: string;
    author: { family: string; given?: string }[];
    issued?: { 'date-parts': number[][] };
    accessed?: { 'date-parts': number[][] };
    publisher?: string;
    'publisher-place'?: string;
    'container-title'?: string;
    volume?: string;
    issue?: string;
    page?: string;
    DOI?: string;
    URL?: string;
    ISBN?: string;
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
    setOutputFormat(format: 'text'): void;
    updateItems(ids: string[]): void;
    makeBibliography(): [unknown, string[]] | false;
    makeCitationCluster(items: { id: string }[]): string;
  }

  const CSL: { Engine: typeof Engine };
  export default CSL;
}
