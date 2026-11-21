import {
  handleSubdomainRedirect,
  type SubdomainRedirectEnv,
} from './subdomain-redirect';

// Entry of the `tuturuuu-apex-redirect` Worker
// (wrangler.subdomain-redirect.jsonc).
export default {
  fetch(request: Request, env: SubdomainRedirectEnv) {
    return handleSubdomainRedirect(request, env);
  },
};
