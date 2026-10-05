/** Only an authoritative GET of the requested master may produce this signal. */
export class ProviderSeriesDeletedError extends Error {
  constructor() {
    super('Provider recurring master deleted');
    this.name = 'ProviderSeriesDeletedError';
  }
}
