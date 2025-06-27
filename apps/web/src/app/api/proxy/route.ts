import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Disable SSL certificate verification
// eslint-disable-next-line turbo/no-undeclared-env-vars
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function GET(request: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-proxy-api-key',
    'Access-Control-Max-Age': '86400',
  };

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { headers: corsHeaders });
  }

  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const apiKey =
      searchParams.get('apiKey') || request.headers.get('x-proxy-api-key');

    if (!url) {
      return NextResponse.json(
        {
          error: 'Missing URL',
          message: 'Please provide a URL to fetch',
          code: 'URL_REQUIRED',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate URL
    let parsedUrl: URL | undefined;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return NextResponse.json(
          {
            error: 'Invalid Protocol',
            message: 'Only HTTP and HTTPS protocols are supported',
            code: 'INVALID_PROTOCOL',
            url,
          },
          { status: 400, headers: corsHeaders }
        );
      }
      // eslint-disable-next-line no-unused-vars
    } catch (_e) {
      return NextResponse.json(
        {
          error: 'Invalid URL',
          message: 'The provided URL is not valid',
          code: 'INVALID_URL',
          url,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // First check API key if provided
    if (process.env.PROXY_API_KEY) {
      if (!apiKey) {
        return NextResponse.json(
          {
            error: 'Missing API Key',
            message: 'An API key is required to use this service',
            code: 'API_KEY_REQUIRED',
          },
          { status: 401, headers: corsHeaders }
        );
      }
      if (apiKey !== process.env.PROXY_API_KEY) {
        return NextResponse.json(
          {
            error: 'Invalid API Key',
            message: 'The provided API key is not valid',
            code: 'INVALID_API_KEY',
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // Then check Supabase auth if no API key provided
    if (!apiKey) {
      const supabase = await createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          {
            error: 'Authentication Required',
            message: 'Please log in to use this service',
            code: 'AUTH_REQUIRED',
          },
          { status: 401, headers: corsHeaders }
        );
      }
    }

    console.log('Fetching URL:', url);
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      // Add timeout
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Fetch Failed',
          message: `Failed to fetch content: ${response.statusText}`,
          code: 'FETCH_FAILED',
          status: response.status,
          url,
        },
        { status: response.status, headers: corsHeaders }
      );
    }

    const contentType = response.headers.get('content-type');
    console.log('Content type:', contentType);

    // Handle Excel files
    if (
      url.match(/\.(xlsx|xls)$/i) ||
      contentType?.includes(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ) ||
      contentType?.includes('application/vnd.ms-excel')
    ) {
      const arrayBuffer = await response.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename=dataset.xlsx',
        },
      });
    }

    // Handle CSV files
    if (url.match(/\.csv$/i) || contentType?.includes('text/csv')) {
      const buffer = await response.arrayBuffer();
      // Try to detect BOM for UTF-16/UTF-8
      const firstBytes = new Uint8Array(buffer.slice(0, 4));
      let decoder: TextDecoder | undefined;

      if (firstBytes[0] === 0xff && firstBytes[1] === 0xfe) {
        decoder = new TextDecoder('utf-16le');
      } else if (firstBytes[0] === 0xfe && firstBytes[1] === 0xff) {
        decoder = new TextDecoder('utf-16be');
      } else if (
        firstBytes[0] === 0xef &&
        firstBytes[1] === 0xbb &&
        firstBytes[2] === 0xbf
      ) {
        decoder = new TextDecoder('utf-8');
      } else {
        try {
          decoder = new TextDecoder('windows-1258');
        } catch {
          decoder = new TextDecoder('utf-8');
        }
      }

      const text = decoder.decode(buffer);
      return new NextResponse(text, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=dataset.csv',
        },
      });
    }

    // Default to text/html for other content
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer);

    return new NextResponse(text, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      {
        error: 'Proxy Error',
        message:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
        code: 'PROXY_ERROR',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
