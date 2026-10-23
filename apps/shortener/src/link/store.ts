export interface ShortLinkRecord {
  id: string;
  link: string;
  password_hash: string | null;
  password_hint: string | null;
}

export interface LinkClickRecord {
  link_id: string;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  country: string | null;
  country_region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  postal_code: string | null;
  vercel_region: string | null;
  vercel_id: string | null;
}

/** Storage port; adapters return null for a missing or ambiguous row. */
export interface ShortLinkStore {
  findBySlug(slug: string): Promise<ShortLinkRecord | null>;
  findById(
    id: string
  ): Promise<Pick<ShortLinkRecord, 'id' | 'link' | 'password_hash'> | null>;
  recordClick(record: LinkClickRecord): Promise<void>;
}
