import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { charLength, utf8Bytes } from './schema-lite.mjs';
import {
  loadInternalValues,
  loadSchema,
  METADATA_DIR,
  REPO_ROOT,
  validateAll,
  validateListing,
} from './validate.mjs';

const schema = loadSchema();
const internalValues = loadInternalValues();
const listings = Object.fromEntries(
  validateAll().map(({ slug, listing }) => [slug, listing])
);

function variant(slug, mutate) {
  const copy = structuredClone(listings[slug]);
  mutate(copy);
  return validateListing(copy, { slug, schema, internalValues });
}

function messages(result) {
  return result.errors.map(({ path: at, message }) => `${at}: ${message}`);
}

function assertRejects(result, pattern) {
  assert.ok(
    messages(result).some((line) => pattern.test(line)),
    `expected an error matching ${pattern}, got:\n${messages(result).join('\n')}`
  );
}

test('every committed store listing passes', () => {
  for (const { slug, errors } of validateAll()) {
    assert.deepEqual(messages({ errors }), [], `${slug}.json`);
  }
});

// Each store is submitted on its own date; all go live together.
const TARGET_SUBMIT_DATES = {
  ios: '2026-11-28T23:59:00+07:00',
  macos: '2026-11-28T23:59:00+07:00',
  android: '2026-11-25T23:59:00+07:00',
  windows: '2026-11-20T23:59:00+07:00',
};

test('every listing carries the shared release plan and public URLs', () => {
  assert.deepEqual(
    Object.keys(listings).sort(),
    Object.keys(TARGET_SUBMIT_DATES).sort()
  );
  for (const [slug, listing] of Object.entries(listings)) {
    assert.equal(listing.release.version, '1.0.0');
    assert.equal(typeof listing.release.build, 'string');
    assert.equal(
      listing.release.targetSubmitDate,
      TARGET_SUBMIT_DATES[slug],
      slug
    );
    assert.equal(listing.release.targetLiveDate, '2026-12-10T23:59:00+07:00');
    assert.equal(listing.urls.privacy, 'https://tuturuuu.com/privacy');
    assert.equal(listing.urls.support, 'https://tuturuuu.com/contact');
  }
});

test('every user-visible string is an { en, vi } object', () => {
  for (const listing of Object.values(listings)) {
    for (const [field, value] of Object.entries(listing.listing)) {
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (item === null) continue;
        assert.deepEqual(Object.keys(item).sort(), ['en', 'vi'], field);
      }
    }
    for (const shots of Object.values(listing.screenshots)) {
      for (const shot of shots) {
        assert.deepEqual(Object.keys(shot.caption).sort(), ['en', 'vi']);
      }
    }
    for (const item of listing.gallery) {
      assert.deepEqual(Object.keys(item.alt).sort(), ['en', 'vi']);
    }
  }
});

test('a missing language or a per-locale block is rejected', () => {
  assertRejects(
    variant('ios', (l) => {
      delete l.listing.subtitle.vi;
    }),
    /listing\.subtitle: missing required property "vi"/u
  );
  assertRejects(
    variant('android', (l) => {
      l.locales = { en: {}, vi: {} };
    }),
    /\$\.locales: unexpected property/u
  );
  assertRejects(
    variant('windows', (l) => {
      l.listing.features[0] = 'Task boards';
    }),
    /features\[0\]: expected object/u
  );
});

test('Vietnamese text is measured in characters and keywords in bytes', () => {
  assert.equal(charLength('Lịch'), 4);
  assert.equal(utf8Bytes('Lịch'), 6);
  assert.equal(charLength('Lịch'.normalize('NFD')), 4);
});

test('App Store keywords over 100 UTF-8 bytes fail even under 100 characters', () => {
  const keywords =
    'việc cần làm,thói quen,chấm công,ghi chú,chi tiêu,kế hoạch,lịch họp,nhóm,tập trung,nhắc';
  assert.ok(charLength(keywords) <= 100);
  assert.ok(utf8Bytes(keywords) > 100);
  assertRejects(
    variant('ios', (l) => {
      l.listing.keywords.vi = keywords;
    }),
    /keywords\.vi: must be at most 100 UTF-8 bytes/u
  );
});

test('App Store keywords reject spaces after commas, duplicates and the app name', () => {
  const cases = [
    ['planner, notes', /keywords\.en: does not match/u],
    ['notes,planner,notes', /duplicate keyword/u],
    ['tuturuuu,planner', /repeats the app name/u],
    ['planner,calendar', /"calendar" repeats the app name/u],
  ];
  for (const [keywords, pattern] of cases) {
    assertRejects(
      variant('ios', (l) => {
        l.listing.keywords.en = keywords;
      }),
      pattern
    );
  }
});

test('per-store character limits apply to each language', () => {
  assertRejects(
    variant('ios', (l) => {
      l.listing.subtitle.vi = 'Công việc, lịch và trợ lý AI cho nhóm';
    }),
    /subtitle\.vi: must be at most 30 characters/u
  );
  assertRejects(
    variant('macos', (l) => {
      l.listing.whatsNew = { en: 'x'.repeat(4001), vi: 'Bản đầu tiên' };
    }),
    /whatsNew\.en: must be at most 4000/u
  );
  assertRejects(
    variant('android', (l) => {
      l.listing.shortDescription.en = 'x'.repeat(81);
    }),
    /shortDescription\.en: must be at most 80/u
  );
  assertRejects(
    variant('windows', (l) => {
      l.listing.features.push({ en: 'x'.repeat(201), vi: 'Lịch' });
    }),
    /features\[\d+\]\.en: must be at most 200/u
  );
  assertRejects(
    variant('windows', (l) => {
      l.listing.searchTerms.push({ en: 'meetings', vi: 'lịch họp' });
    }),
    /searchTerms: must have at most 7 items/u
  );
  assertRejects(
    variant('windows', (l) => {
      l.screenshots.desktop[0].caption.vi = 'x'.repeat(201);
    }),
    /caption\.vi: must be at most 200/u
  );
  assertRejects(
    variant('ios', (l) => {
      l.screenshots['iphone-6.9'][0].caption.en = 'x'.repeat(61);
    }),
    /caption\.en: must be at most 60/u
  );
});

test('Microsoft Store short descriptions over 270 characters warn without failing', () => {
  const result = variant('windows', (l) => {
    l.listing.shortDescription.en = 'Plan work. '.repeat(30).trim();
  });
  assert.deepEqual(messages(result), []);
  assert.ok(
    result.warnings.some(({ path: at }) => at.endsWith('shortDescription.en'))
  );
});

test('release dates need an offset, valid order and the status milestones', () => {
  assertRejects(
    variant('ios', (l) => {
      l.release.status = 'published';
    }),
    /status: expected one of/u
  );
  assertRejects(
    variant('ios', (l) => {
      l.release.targetSubmitDate = '2026-11-28';
    }),
    /targetSubmitDate: does not match/u
  );
  assertRejects(
    variant('android', (l) => {
      l.release.submittedAt = '2026-11-28T10:00:00';
    }),
    /submittedAt: does not match/u
  );
  assertRejects(
    variant('android', (l) => {
      l.release.build = 103;
    }),
    /build: expected string/u
  );
  assertRejects(
    variant('macos', (l) => {
      l.release.targetLiveDate = '2026-11-01T00:00:00Z';
    }),
    /targetLiveDate: precedes targetSubmitDate/u
  );
  assertRejects(
    variant('windows', (l) => {
      l.release.status = 'live';
      l.release.submittedAt = '2026-11-28T09:00:00+07:00';
      l.release.approvedAt = '2026-12-02T09:00:00+07:00';
    }),
    /liveAt: is required once status is "live"/u
  );
  const live = variant('windows', (l) => {
    Object.assign(l.release, {
      status: 'live',
      submittedAt: '2026-11-28T09:00:00+07:00',
      approvedAt: '2026-12-02T09:00:00+07:00',
      liveAt: '2026-12-02T10:00:00Z',
      storeUrl: 'https://apps.microsoft.com/detail/9N7B6VC7RR7W',
    });
  });
  assert.deepEqual(messages(live), []);
});

test('URLs must be https on a public store host or tuturuuu.com', () => {
  assertRejects(
    variant('ios', (l) => {
      l.urls.support = 'http://tuturuuu.com/contact';
    }),
    /urls\.support: does not match/u
  );
  assertRejects(
    variant('ios', (l) => {
      l.release.storeUrl = 'https://appstoreconnect.apple.com/apps/123';
    }),
    /storeUrl: does not match/u
  );
  assertRejects(
    variant('android', (l) => {
      l.listing.fullDescription.en +=
        '\nRoadmap: https://github.com/tutur3u/platform/issues/1';
    }),
    /URL host github\.com is not a public store/u
  );
  assertRejects(
    variant('android', (l) => {
      l.listing.fullDescription.vi += '\nXem https://tuturuuu.com/?token=abc';
    }),
    /must not carry credentials or query strings/u
  );
});

test('private data stays out of the public files', () => {
  assertRejects(
    variant('windows', (l) => {
      l.packagePublisher = 'CN=0AC0922B-9A14-4E11-AC48-1A1AC49C81E1';
    }),
    /packagePublisher" is not public listing data/u
  );
  assertRejects(
    variant('ios', (l) => {
      l.listing.description.en += '\nReviewer login: reviewer@example.com';
    }),
    /contains a email address/u
  );
  assertRejects(
    variant('windows', (l) => {
      l.productId = 'Tuturuuu.Tuturuuu_3fbz370g3eega';
    }),
    /contains a value from apps\/mobile\/store\/internal/u
  );
  assertRejects(
    variant('ios', (l) => {
      l.reviewerNotes = {
        en: 'Use the demo workspace',
        vi: 'Dùng workspace mẫu',
      };
    }),
    /reviewerNotes" is not public listing data/u
  );
  const windows = readFileSync(
    path.join(REPO_ROOT, METADATA_DIR, 'windows.json'),
    'utf8'
  );
  assert.ok(!windows.includes('CN='));
  assert.ok(internalValues.includes('CN=0AC0922B-9A14-4E11-AC48-1A1AC49C81E1'));
});

test('copy rejects non-NFC text, emoji and ranking or competitor claims', () => {
  assertRejects(
    variant('android', (l) => {
      l.listing.title.vi = l.listing.title.vi.normalize('NFD');
    }),
    /NFC/u
  );
  assertRejects(
    variant('android', (l) => {
      l.listing.shortDescription.en = 'Plan your day ✅';
    }),
    /emoji/u
  );
  assertRejects(
    variant('windows', (l) => {
      l.listing.description.vi += '\nỨng dụng tốt nhất cho nhóm.';
    }),
    /forbidden claim "tốt nhất"/u
  );
  assertRejects(
    variant('ios', (l) => {
      l.gallery[0].alt.en = 'Boards imported from Trello';
    }),
    /forbidden claim "Trello"/u
  );
});

test('types.ts declares every schema property', () => {
  const types = readFileSync(
    path.join(REPO_ROOT, METADATA_DIR, 'types.ts'),
    'utf8'
  );
  const names = new Set();
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node.properties ?? {})) names.add(key);
    for (const value of Object.values(node)) collect(value);
  };
  collect(schema);
  for (const locale of ['en', 'vi']) names.delete(locale);
  for (const name of names) {
    const escaped = name.replace(/\$/gu, '\\$');
    const declared = new RegExp(`(^|[\\s{;,])${escaped}\\??:`, 'mu');
    assert.ok(declared.test(types), `types.ts is missing "${name}"`);
  }
});
