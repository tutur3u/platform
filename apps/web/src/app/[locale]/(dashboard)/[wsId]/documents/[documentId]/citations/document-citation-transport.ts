import { CiteWorkSchema } from '@tuturuuu/cite';
import {
  type CitationLibraryItem as WireLibraryItem,
  captureCitationSource,
  createCitationLibraryItem,
  createCitationOperationId,
  deleteCitationLibraryItem,
  getCitationLibraryItem,
  getCitationLibraryItems,
  listCitationLibrary,
  repairCitation,
  updateCitationLibraryItem,
} from '@tuturuuu/internal-api/cite';
import type {
  CitationLibraryItem,
  CitationRepair,
  CitationResult,
} from '@tuturuuu/ui/text-editor/citation';
import { summarizeWork } from './document-citation-adapter';
import type { DocumentCitationTransport } from './document-citation-adapter';
import {
  mapCaptureError,
  mapCaptureResponse,
} from './document-citation-capture';

const LIBRARY_PAGE_SIZE = 50;
const MAX_LINKED_ITEMS = 50;

type ErrorShape = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  billingStatus?: unknown;
};

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as ErrorShape;
  for (const value of [code, message]) {
    if (typeof value === 'string' && /^[A-Z_]+$/.test(value)) return value;
  }
  return null;
}

function errorStatus(error: unknown) {
  const status = (error as ErrorShape | null)?.status;
  return typeof status === 'number' ? status : null;
}

/** Maps transport failures to typed states; server text is never shown. */
export function toCitationFailure(error: unknown): CitationResult<never> {
  const code = errorCode(error);
  const status = errorStatus(error);
  const billingStatus = (error as ErrorShape | null)?.billingStatus;
  if (billingStatus === 'unknown' || billingStatus === 'settled') {
    return {
      status: 'error',
      code: code ?? 'UPSTREAM_ERROR',
      billing: billingStatus,
    };
  }
  if (
    code === 'INSUFFICIENT_CREDITS' ||
    code === 'CREDITS_EXHAUSTED' ||
    status === 402
  ) {
    return { status: 'unavailable', reason: 'insufficient_credits' };
  }
  if (
    code &&
    [
      'BILLING_PENDING',
      'INVALID_AI_OUTPUT',
      'OPERATION_EXPIRED',
      'OPERATION_CONFLICT',
      'GENERATION_IN_PROGRESS',
      'CREDIT_CHECK_FAILED',
      'AI_UNAVAILABLE',
      'GENERATION_FAILED',
      'CANCELLED',
    ].includes(code)
  ) {
    return { status: 'error', code };
  }
  if (code === 'FORBIDDEN' || status === 403) {
    return { status: 'unavailable', reason: 'forbidden' };
  }
  if (
    code === 'LIBRARY_UNAVAILABLE' ||
    code === 'FEATURE_UNAVAILABLE' ||
    status === 503
  ) {
    return { status: 'unavailable', reason: 'not_provisioned' };
  }
  if (
    status === null &&
    typeof navigator !== 'undefined' &&
    !navigator.onLine
  ) {
    return { status: 'unavailable', reason: 'offline' };
  }
  return { status: 'error', code: code ?? 'UPSTREAM_ERROR' };
}

function toLibraryItem(item: WireLibraryItem): CitationLibraryItem | null {
  const parsed = CiteWorkSchema.safeParse(item.work);
  if (!parsed.success) return null;
  return {
    id: item.id,
    version: item.version,
    tags: item.tags,
    work: parsed.data,
    summary: summarizeWork(parsed.data),
    updatedAt: item.updatedAt,
  };
}

/** Parses the AI repair response; anything not a canonical work is rejected. */
export function parseRepairResponse(
  response: unknown
): CitationResult<CitationRepair> {
  if (!response || typeof response !== 'object') {
    return { status: 'error', code: 'INVALID_RESPONSE' };
  }
  const body = response as {
    work?: unknown;
    uncertainFields?: unknown;
    billing?: unknown;
  };
  const parsed = CiteWorkSchema.safeParse(body.work);
  if (!parsed.success) return { status: 'error', code: 'INVALID_RESPONSE' };
  const uncertainFields = Array.isArray(body.uncertainFields)
    ? body.uncertainFields.filter(
        (field): field is string => typeof field === 'string'
      )
    : [];
  const billing = body.billing;
  const credits =
    billing &&
    typeof billing === 'object' &&
    'status' in billing &&
    billing.status === 'settled' &&
    'creditsDeducted' in billing
      ? billing.creditsDeducted
      : null;
  return {
    status: 'ok',
    data: {
      work: parsed.data,
      summary: summarizeWork(parsed.data),
      uncertainFields,
      ...(typeof credits === 'number' &&
      Number.isFinite(credits) &&
      credits >= 0
        ? { creditsDeducted: credits }
        : {}),
    },
  };
}

/**
 * Library calls use the document's workspace and its existing permissions; AI
 * repair is billed server-side to the person's own credits.
 */
export function createDocumentCitationTransport(
  wsId: string
): DocumentCitationTransport {
  const get = async (id: string) => {
    try {
      const { item } = await getCitationLibraryItem(wsId, id);
      return { id, item: toLibraryItem(item) };
    } catch (error) {
      if (errorStatus(error) === 404) return { id, item: null };
      throw error;
    }
  };

  return {
    library: {
      queryKey: ['workspace', wsId, 'citation-library'],
      async list(query) {
        try {
          const { items } = await listCitationLibrary(wsId, {
            limit: LIBRARY_PAGE_SIZE,
            search: query,
          });
          return {
            status: 'ok',
            data: items.flatMap((item) => toLibraryItem(item) ?? []),
          };
        } catch (error) {
          return toCitationFailure(error);
        }
      },
      async getMany(ids) {
        const boundedIds = [...new Set(ids)].slice(0, MAX_LINKED_ITEMS);
        if (!boundedIds.length) {
          return { status: 'ok', data: { items: [], missingIds: [] } };
        }
        try {
          const found = await getCitationLibraryItems(wsId, boundedIds);
          return {
            status: 'ok',
            data: {
              items: found.items.flatMap((item) => toLibraryItem(item) ?? []),
              missingIds: found.missingIds,
            },
          };
        } catch (error) {
          return toCitationFailure(error);
        }
      },
      async save(work) {
        try {
          const { item } = await createCitationLibraryItem(wsId, {
            id: crypto.randomUUID(),
            work,
          });
          const saved = toLibraryItem(item);
          return saved
            ? { status: 'ok', data: saved }
            : { status: 'error', code: 'INVALID_RESPONSE' };
        } catch (error) {
          const existingId = (error as { existingId?: unknown } | null)
            ?.existingId;
          if (
            errorCode(error) === 'DUPLICATE_SOURCE' &&
            typeof existingId === 'string'
          ) {
            try {
              const { item } = await get(existingId);
              if (item) return { status: 'ok', data: item };
            } catch (lookupError) {
              return toCitationFailure(lookupError);
            }
          }
          return toCitationFailure(error);
        }
      },
      async update(item, work) {
        try {
          const result = await updateCitationLibraryItem(wsId, item.id, {
            expectedVersion: item.version,
            work,
            tags: item.tags ?? [],
          });
          const updated = toLibraryItem(result.item);
          return updated
            ? { status: 'ok', data: updated }
            : { status: 'error', code: 'INVALID_RESPONSE' };
        } catch (error) {
          return toCitationFailure(error);
        }
      },
      async remove(item) {
        try {
          await deleteCitationLibraryItem(wsId, item.id, item.version);
          return { status: 'ok', data: undefined };
        } catch (error) {
          return toCitationFailure(error);
        }
      },
    },
    capture: async (input) => {
      try {
        return mapCaptureResponse(await captureCitationSource(input));
      } catch (error) {
        return mapCaptureError(error);
      }
    },
    repair: {
      createOperationId: () => createCitationOperationId(),
      run: async (input, operationId) => {
        try {
          return parseRepairResponse(
            await repairCitation(
              'work' in input
                ? {
                    operationId,
                    input: JSON.stringify(input.work).slice(0, 16000),
                    existingWork: input.work,
                  }
                : { operationId, input: input.raw }
            )
          );
        } catch (error) {
          return toCitationFailure(error);
        }
      },
    },
  };
}
