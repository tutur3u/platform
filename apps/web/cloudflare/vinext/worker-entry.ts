// vinext Worker entry. The fetch install module is imported first so it
// evaluates before vinext captures the network fetch.
import './install-workers-fetch';

export * from 'vinext/server/fetch-handler';
export { default } from 'vinext/server/fetch-handler';
