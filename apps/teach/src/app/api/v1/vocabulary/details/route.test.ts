import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

describe('GET /api/v1/vocabulary/details scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when both url and word params are missing', async () => {
    const request = new NextRequest('http://localhost/api/v1/vocabulary/details');
    const response = await GET(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.message).toContain('Either url or word query parameter is required');
  });

  it('returns 400 for non-Cambridge dictionary URLs', async () => {
    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/details?url=https://example.com/eat'
    );
    const response = await GET(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.message).toContain('Only Cambridge Dictionary URLs are allowed');
  });

  it('scrapes pronunciation, definition, and examples successfully from mocked HTML', async () => {
    const mockHtml = `
      <html>
        <body>
          <span class="headword hdb tw-bw dhw dpos-h_hw"><span class="hw dhw">eat</span></span>
          <span class="uk dpron-i">
            <span class="region dreg">uk</span>
            <span class="pron dpron">/<span class="ipa dipa lpr-2 lpl-1">iːt</span>/</span>
          </span>
          <span class="us dpron-i">
            <span class="region dreg">us</span>
            <span class="pron dpron">/<span class="ipa dipa lpr-2 lpl-1">iːt</span>/</span>
          </span>
          <div class="def-block ddef_block">
            <div class="def ddef_d db">to put or take food into the mouth:</div>
            <div class="examp dexamp"><span class="eg deg">Do you eat meat?</span></div>
            <div class="examp dexamp"><span class="eg deg">I feel like eating.</span></div>
          </div>
        </body>
      </html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockHtml,
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/details?word=eat'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.word).toBe('eat');
    expect(data.pronunciation).toBe('/iːt/');
    expect(data.definition).toBe('to put or take food into the mouth');
    expect(data.examples).toEqual(['Do you eat meat?', 'I feel like eating.']);
  });

  it('formats different UK and US pronunciations correctly', async () => {
    const mockHtml = `
      <html>
        <body>
          <span class="headword hdb tw-bw dhw dpos-h_hw"><span class="hw dhw">example</span></span>
          <span class="uk dpron-i">
            <span class="region dreg">uk</span>
            <span class="pron dpron">/<span class="ipa dipa lpr-2 lpl-1">ɪɡˈzɑːm.pəl</span>/</span>
          </span>
          <span class="us dpron-i">
            <span class="region dreg">us</span>
            <span class="pron dpron">/<span class="ipa dipa lpr-2 lpl-1">ɪɡˈzæm.pəl</span>/</span>
          </span>
          <div class="def-block ddef_block">
            <div class="def ddef_d db">something that is representative:</div>
          </div>
        </body>
      </html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockHtml,
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/details?word=example'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.pronunciation).toBe('UK: /ɪɡˈzɑːm.pəl/ • US: /ɪɡˈzæm.pəl/');
  });
});
