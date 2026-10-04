interface BannerLifecycleResult {
  data?: unknown;
  error: unknown;
}

interface BannerRetirementRow {
  public_url: string;
  file_path: string;
  delete_ready: boolean;
}

/** The lifecycle helper requires only these service-side RPC/Storage capabilities. */
export interface BannerLifecycleAdmin {
  rpc(
    name:
      | 'expire_profile_banner_operations'
      | 'pending_profile_banner_retirements'
      | 'complete_profile_banner_retirement',
    args: Record<string, string | boolean>
  ): PromiseLike<BannerLifecycleResult>;
  storage: {
    from(bucket: 'banners'): {
      remove(paths: string[]): PromiseLike<BannerLifecycleResult>;
      upload(
        path: string,
        bytes: Buffer,
        options: { upsert: boolean; contentType: string; cacheControl: string }
      ): PromiseLike<BannerLifecycleResult>;
    };
  };
}

function isRetirementRow(value: unknown): value is BannerRetirementRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'public_url' in value &&
    typeof value.public_url === 'string' &&
    'file_path' in value &&
    typeof value.file_path === 'string' &&
    'delete_ready' in value &&
    typeof value.delete_ready === 'boolean'
  );
}

/** Never infer ownership from a substring or from a client-supplied origin. */
export function bannerStorageOrigin() {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) throw new Error('Storage configuration is unavailable');
  const url = new URL(configured);
  if (!['https:', 'http:'].includes(url.protocol))
    throw new Error('Invalid Storage configuration');
  return url.origin;
}

export function ownedBannerPath(url: string, actor: string, origin: string) {
  const prefix = `${origin}/storage/v1/object/public/banners/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  const actorPrefix = `${actor}/`;
  if (!path.startsWith(actorPrefix)) return null;
  const filename = path.slice(actorPrefix.length);
  return /^(?:[0-9]{13}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:png|jpg|jpeg|gif|webp)$/.test(
    filename
  )
    ? path
    : null;
}

/** Retirements are permanent tombstones; removing immutable files is retry-safe. */
export async function cleanRetiredBanners(
  admin: BannerLifecycleAdmin,
  actor: string,
  origin = bannerStorageOrigin()
) {
  const expired = await admin.rpc('expire_profile_banner_operations', {
    p_user_id: actor,
    p_storage_origin: origin,
  });
  if (expired.error) return false;
  const { data, error } = await admin.rpc(
    'pending_profile_banner_retirements',
    {
      p_user_id: actor,
    }
  );
  if (error || !Array.isArray(data)) return false;
  let complete = data.length < 20;
  for (const value of data) {
    if (!isRetirementRow(value)) {
      complete = false;
      continue;
    }
    const row = value;
    const path = ownedBannerPath(row.public_url, actor, origin);
    if (!path || path !== row.file_path) {
      complete = false;
      continue;
    }
    // Replace the retired image immediately while retaining an immutable slot
    // until every issued non-upsert upload token has expired. CDN propagation
    // remains subject to Storage's cache policy, not a client-side guarantee.
    const storage = admin.storage.from('banners');
    const removed = row.delete_ready
      ? await storage.remove([path])
      : await storage.upload(path, Buffer.from('retired'), {
          upsert: true,
          contentType: 'image/png',
          cacheControl: '0',
        });
    if (removed.error) {
      complete = false;
      continue;
    }
    const marked = await admin.rpc('complete_profile_banner_retirement', {
      p_user_id: actor,
      p_public_url: row.public_url,
      p_deleted: Boolean(row.delete_ready),
    });
    if (marked.error) complete = false;
  }
  return complete;
}

/** External/foreign URLs keep their legacy meaning; managed assignments are canonical. */
export function canonicalManagedBanner(
  value: string | null | undefined,
  actor: string
) {
  if (value == null) return true;
  const origin = bannerStorageOrigin();
  const parsed = new URL(value);
  let path: string;
  try {
    path = new URL(decodeURIComponent(parsed.pathname), origin).pathname;
  } catch {
    return false;
  }
  if (
    parsed.origin !== origin ||
    !path.startsWith(`/storage/v1/object/public/banners/${actor}/`)
  )
    return true;
  return ownedBannerPath(value, actor, origin) !== null;
}
