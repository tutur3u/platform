import { describe, expect, it } from 'vitest';
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  INTERNAL_WORKSPACE_SLUG,
  isInternalWorkspaceSlug,
  MAX_CODE_LENGTH,
  MAX_COLOR_LENGTH,
  MAX_DATE_STRING_LENGTH,
  MAX_ID_LENGTH,
  MAX_IP_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_OTP_LENGTH,
  MAX_PAYLOAD_SIZE,
  MAX_REQUEST_BODY_BYTES,
  MAX_RICH_TEXT_LENGTH,
  MAX_SEARCH_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
  MAX_TEXT_FIELD_BYTES,
  MAX_URL_LENGTH,
  MAX_WORKSPACES_FOR_FREE_USERS,
  normalizeWorkspaceContextId,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
  toWorkspaceSlug,
} from '../constants';

describe('Constants', () => {
  describe('ROOT_WORKSPACE_ID', () => {
    it('should be a valid UUID with all zeros', () => {
      expect(ROOT_WORKSPACE_ID).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('should match UUID format', () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(ROOT_WORKSPACE_ID).toMatch(uuidRegex);
    });
  });

  describe('INTERNAL_WORKSPACE_SLUG', () => {
    it('should be "internal"', () => {
      expect(INTERNAL_WORKSPACE_SLUG).toBe('internal');
    });
  });

  describe('PERSONAL_WORKSPACE_SLUG', () => {
    it('should be "personal"', () => {
      expect(PERSONAL_WORKSPACE_SLUG).toBe('personal');
    });
  });

  describe('MAX_WORKSPACES_FOR_FREE_USERS', () => {
    it('should be a positive number', () => {
      expect(MAX_WORKSPACES_FOR_FREE_USERS).toBeGreaterThan(0);
    });

    it('should be 10', () => {
      expect(MAX_WORKSPACES_FOR_FREE_USERS).toBe(10);
    });
  });

  describe('GitHub constants', () => {
    it('should have correct GitHub owner', () => {
      expect(GITHUB_OWNER).toBe('tutur3u');
    });

    it('should have correct GitHub repo', () => {
      expect(GITHUB_REPO).toBe('platform');
    });
  });
});

describe('resolveWorkspaceId', () => {
  describe('internal workspace resolution', () => {
    it('should resolve "internal" to ROOT_WORKSPACE_ID', () => {
      expect(resolveWorkspaceId('internal')).toBe(ROOT_WORKSPACE_ID);
    });

    it('should resolve "INTERNAL" (uppercase) to ROOT_WORKSPACE_ID', () => {
      expect(resolveWorkspaceId('INTERNAL')).toBe(ROOT_WORKSPACE_ID);
    });

    it('should resolve "Internal" (mixed case) to ROOT_WORKSPACE_ID', () => {
      expect(resolveWorkspaceId('Internal')).toBe(ROOT_WORKSPACE_ID);
    });

    it('should resolve "iNtErNaL" (mixed case) to ROOT_WORKSPACE_ID', () => {
      expect(resolveWorkspaceId('iNtErNaL')).toBe(ROOT_WORKSPACE_ID);
    });
  });

  describe('regular workspace IDs', () => {
    it('should return UUID unchanged', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(resolveWorkspaceId(uuid)).toBe(uuid);
    });

    it('should return any non-internal string unchanged', () => {
      expect(resolveWorkspaceId('my-workspace')).toBe('my-workspace');
      expect(resolveWorkspaceId('workspace-123')).toBe('workspace-123');
    });

    it('should return "personal" unchanged', () => {
      expect(resolveWorkspaceId('personal')).toBe('personal');
    });
  });

  describe('edge cases', () => {
    it('should return empty string unchanged', () => {
      expect(resolveWorkspaceId('')).toBe('');
    });

    it('should handle strings that contain "internal" but are not exactly "internal"', () => {
      expect(resolveWorkspaceId('internal-workspace')).toBe(
        'internal-workspace'
      );
      expect(resolveWorkspaceId('my-internal')).toBe('my-internal');
      expect(resolveWorkspaceId('internals')).toBe('internals');
    });
  });
});

describe('toWorkspaceSlug', () => {
  describe('personal workspace', () => {
    it('should return "personal" when personal option is true', () => {
      expect(toWorkspaceSlug('any-id', { personal: true })).toBe(
        PERSONAL_WORKSPACE_SLUG
      );
    });

    it('should return "personal" regardless of workspaceId when personal is true', () => {
      expect(toWorkspaceSlug(ROOT_WORKSPACE_ID, { personal: true })).toBe(
        PERSONAL_WORKSPACE_SLUG
      );
      expect(
        toWorkspaceSlug('550e8400-e29b-41d4-a716-446655440000', {
          personal: true,
        })
      ).toBe(PERSONAL_WORKSPACE_SLUG);
    });
  });

  describe('internal workspace', () => {
    it('should return "internal" for ROOT_WORKSPACE_ID', () => {
      expect(toWorkspaceSlug(ROOT_WORKSPACE_ID)).toBe(INTERNAL_WORKSPACE_SLUG);
    });

    it('should return "internal" for ROOT_WORKSPACE_ID with personal: false', () => {
      expect(toWorkspaceSlug(ROOT_WORKSPACE_ID, { personal: false })).toBe(
        INTERNAL_WORKSPACE_SLUG
      );
    });
  });

  describe('regular workspaces', () => {
    it('should return the workspace ID unchanged', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(toWorkspaceSlug(uuid)).toBe(uuid);
    });

    it('should return workspace ID when no options provided', () => {
      expect(toWorkspaceSlug('my-workspace')).toBe('my-workspace');
    });

    it('should return workspace ID when personal is false', () => {
      expect(toWorkspaceSlug('my-workspace', { personal: false })).toBe(
        'my-workspace'
      );
    });
  });

  describe('options handling', () => {
    it('should handle empty options object', () => {
      expect(toWorkspaceSlug('workspace-id', {})).toBe('workspace-id');
    });

    it('should handle undefined options', () => {
      expect(toWorkspaceSlug('workspace-id', undefined)).toBe('workspace-id');
    });
  });
});

describe('normalizeWorkspaceContextId', () => {
  it('defaults empty values to the personal workspace slug', () => {
    expect(normalizeWorkspaceContextId()).toBe(PERSONAL_WORKSPACE_SLUG);
    expect(normalizeWorkspaceContextId(null)).toBe(PERSONAL_WORKSPACE_SLUG);
    expect(normalizeWorkspaceContextId('   ')).toBe(PERSONAL_WORKSPACE_SLUG);
  });

  it('keeps personal workspace identifiers canonicalized to the personal slug', () => {
    expect(normalizeWorkspaceContextId('personal')).toBe(
      PERSONAL_WORKSPACE_SLUG
    );
    expect(normalizeWorkspaceContextId(' PERSONAL ')).toBe(
      PERSONAL_WORKSPACE_SLUG
    );
  });

  it('resolves the internal slug to the root workspace UUID', () => {
    expect(normalizeWorkspaceContextId('internal')).toBe(ROOT_WORKSPACE_ID);
    expect(normalizeWorkspaceContextId(' INTERNAL ')).toBe(ROOT_WORKSPACE_ID);
  });

  it('keeps regular workspace UUIDs unchanged after trimming', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(normalizeWorkspaceContextId(` ${uuid} `)).toBe(uuid);
  });
});

describe('isInternalWorkspaceSlug', () => {
  describe('internal slug detection', () => {
    it('should return true for "internal"', () => {
      expect(isInternalWorkspaceSlug('internal')).toBe(true);
    });

    it('should return true for "INTERNAL" (uppercase)', () => {
      expect(isInternalWorkspaceSlug('INTERNAL')).toBe(true);
    });

    it('should return true for "Internal" (mixed case)', () => {
      expect(isInternalWorkspaceSlug('Internal')).toBe(true);
    });

    it('should return true for "iNtErNaL" (random case)', () => {
      expect(isInternalWorkspaceSlug('iNtErNaL')).toBe(true);
    });
  });

  describe('non-internal identifiers', () => {
    it('should return false for "personal"', () => {
      expect(isInternalWorkspaceSlug('personal')).toBe(false);
    });

    it('should return false for regular workspace IDs', () => {
      expect(
        isInternalWorkspaceSlug('550e8400-e29b-41d4-a716-446655440000')
      ).toBe(false);
    });

    it('should return false for ROOT_WORKSPACE_ID', () => {
      expect(isInternalWorkspaceSlug(ROOT_WORKSPACE_ID)).toBe(false);
    });

    it('should return false for strings containing "internal"', () => {
      expect(isInternalWorkspaceSlug('internal-workspace')).toBe(false);
      expect(isInternalWorkspaceSlug('my-internal')).toBe(false);
      expect(isInternalWorkspaceSlug('internals')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for null', () => {
      expect(isInternalWorkspaceSlug(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isInternalWorkspaceSlug(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isInternalWorkspaceSlug('')).toBe(false);
    });
  });
});

describe('Constant relationships', () => {
  it('resolveWorkspaceId and toWorkspaceSlug should be inverse operations for internal', () => {
    const slug = INTERNAL_WORKSPACE_SLUG;
    const id = resolveWorkspaceId(slug);
    const backToSlug = toWorkspaceSlug(id);
    expect(backToSlug).toBe(slug);
  });

  it('resolveWorkspaceId should return ROOT_WORKSPACE_ID for internal slug', () => {
    expect(resolveWorkspaceId(INTERNAL_WORKSPACE_SLUG)).toBe(ROOT_WORKSPACE_ID);
  });

  it('toWorkspaceSlug should return INTERNAL_WORKSPACE_SLUG for ROOT_WORKSPACE_ID', () => {
    expect(toWorkspaceSlug(ROOT_WORKSPACE_ID)).toBe(INTERNAL_WORKSPACE_SLUG);
  });
});

describe('Payload protection constants', () => {
  describe('Generic tier constants order', () => {
    it('tiers increase in size', () => {
      const tiers = [
        MAX_CODE_LENGTH,
        MAX_OTP_LENGTH,
        MAX_IP_LENGTH,
        MAX_COLOR_LENGTH,
        MAX_DATE_STRING_LENGTH,
        MAX_SHORT_TEXT_LENGTH,
        MAX_ID_LENGTH,
        MAX_NAME_LENGTH,
        MAX_SEARCH_LENGTH,
        MAX_MEDIUM_TEXT_LENGTH,
        MAX_URL_LENGTH,
        MAX_LONG_TEXT_LENGTH,
        MAX_RICH_TEXT_LENGTH,
      ];

      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1]!);
      }
    });
  });

  describe('Payload size relationships', () => {
    it('MAX_REQUEST_BODY_BYTES >= MAX_PAYLOAD_SIZE', () => {
      expect(MAX_REQUEST_BODY_BYTES).toBeGreaterThanOrEqual(MAX_PAYLOAD_SIZE);
    });

    it('MAX_TEXT_FIELD_BYTES covers worst-case emoji (4 bytes × MAX_LONG_TEXT_LENGTH)', () => {
      expect(MAX_TEXT_FIELD_BYTES).toBeGreaterThanOrEqual(
        MAX_LONG_TEXT_LENGTH * 4
      );
    });
  });

  describe('All protection constants are positive integers', () => {
    const constants: Record<string, number> = {
      MAX_CODE_LENGTH,
      MAX_OTP_LENGTH,
      MAX_IP_LENGTH,
      MAX_COLOR_LENGTH,
      MAX_DATE_STRING_LENGTH,
      MAX_SHORT_TEXT_LENGTH,
      MAX_ID_LENGTH,
      MAX_NAME_LENGTH,
      MAX_SEARCH_LENGTH,
      MAX_MEDIUM_TEXT_LENGTH,
      MAX_URL_LENGTH,
      MAX_LONG_TEXT_LENGTH,
      MAX_RICH_TEXT_LENGTH,
      MAX_PAYLOAD_SIZE,
      MAX_REQUEST_BODY_BYTES,
      MAX_TEXT_FIELD_BYTES,
    };

    for (const [name, value] of Object.entries(constants)) {
      it(`${name} is a positive integer`, () => {
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      });
    }
  });
});
