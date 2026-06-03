const TRUSTED_PROVIDER_HOST_SUFFIXES = {
  r2: ['.r2.cloudflarestorage.com'],
  supabase: ['.supabase.co'],
};

const LOCAL_UPLOAD_HOSTS = new Set([
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'localhost',
]);

function parseHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function parseAllowedUploadOrigins(value = '') {
  const origins = new Set();

  for (const rawOrigin of value.split(',')) {
    const origin = rawOrigin.trim();
    if (!origin) {
      continue;
    }

    const url = parseHttpUrl(origin);
    if (url) {
      origins.add(url.origin);
    }
  }

  return origins;
}

function isTrustedProviderHost(provider, hostname) {
  const suffixes = TRUSTED_PROVIDER_HOST_SUFFIXES[provider];
  if (!suffixes) {
    return false;
  }

  return suffixes.some((suffix) => hostname.endsWith(suffix));
}

export function validateSignedUploadDestination(
  uploadPayload,
  { allowLocalUploadOrigins = false, allowedUploadOrigins = '' } = {}
) {
  const provider =
    typeof uploadPayload?.provider === 'string'
      ? uploadPayload.provider.trim().toLowerCase()
      : '';
  if (!Object.hasOwn(TRUSTED_PROVIDER_HOST_SUFFIXES, provider)) {
    return {
      ok: false,
      message: 'Callback returned an untrusted upload provider.',
    };
  }

  const signedUrl =
    typeof uploadPayload?.signedUrl === 'string' ? uploadPayload.signedUrl : '';
  const url = parseHttpUrl(signedUrl);
  if (!url) {
    return {
      ok: false,
      message: 'Callback returned an invalid upload URL.',
    };
  }

  const configuredOrigins = parseAllowedUploadOrigins(allowedUploadOrigins);
  if (configuredOrigins.has(url.origin)) {
    return { ok: true, signedUrl: url.toString() };
  }

  if (
    url.protocol === 'https:' &&
    isTrustedProviderHost(provider, url.hostname)
  ) {
    return { ok: true, signedUrl: url.toString() };
  }

  if (allowLocalUploadOrigins && LOCAL_UPLOAD_HOSTS.has(url.hostname)) {
    return { ok: true, signedUrl: url.toString() };
  }

  return {
    ok: false,
    message: 'Callback returned an upload URL outside allowed storage origins.',
  };
}

function getHeaderValue(headers, headerName) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return null;
  }

  const lowerHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerHeaderName && typeof value === 'string') {
      return value;
    }
  }

  return null;
}

export function buildSignedUploadHeaders(uploadPayload, contentType) {
  const headers = {
    'Content-Type':
      getHeaderValue(uploadPayload?.headers, 'Content-Type') ||
      contentType ||
      'application/octet-stream',
  };

  if (typeof uploadPayload?.token === 'string' && uploadPayload.token.trim()) {
    headers.Authorization = `Bearer ${uploadPayload.token.trim()}`;
  }

  return headers;
}
