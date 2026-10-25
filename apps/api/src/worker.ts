import retained from '../generated/retained-routes.json';
import { createApi } from './pipeline';
import { endpoints } from './routes';

export default { fetch: createApi({ endpoints, retained }) };
