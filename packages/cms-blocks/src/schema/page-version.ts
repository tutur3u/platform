import {
  CMS_BLOCKS_SCHEMA_VERSION,
  type CmsPage,
  cmsPageSchema,
} from './schema';

/** Page-version rows store one page JSON object, capped by the data contract. */
export const CMS_PAGE_VERSION_MAX_BYTES = 2 * 1024 * 1024;

/** Insert shape for `workspace_external_project_page_versions` (`data` + `schema_version`). */
export interface CmsPageVersionPayload {
  data: CmsPage;
  schema_version: number;
}

/** Validates a page and returns the payload a draft page version stores; throws when invalid or too large. */
export function toCmsPageVersionPayload(page: unknown): CmsPageVersionPayload {
  const data = cmsPageSchema.parse(page);
  const bytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
  if (bytes > CMS_PAGE_VERSION_MAX_BYTES) {
    throw new RangeError(
      `Page JSON is ${bytes} bytes; the limit is ${CMS_PAGE_VERSION_MAX_BYTES}.`
    );
  }
  return { data, schema_version: data.schemaVersion };
}

/** Reads a stored page version, or `null` when its schema version is unsupported or the JSON is invalid. */
export function parseCmsPageVersion(row: {
  data: unknown;
  schema_version: number;
}): CmsPage | null {
  if (row.schema_version !== CMS_BLOCKS_SCHEMA_VERSION) return null;
  const parsed = cmsPageSchema.safeParse(row.data);
  return parsed.success ? parsed.data : null;
}
