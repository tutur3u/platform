import { createClient } from '@tutur3u/supabase/next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Disable SSL certificate verification
// eslint-disable-next-line turbo/no-undeclared-env-vars
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const apiKey =
      searchParams.get('apiKey') || request.headers.get('x-proxy-api-key');

    // First check API key if provided
    if (process.env.PROXY_API_KEY) {
      if (!apiKey) {
        console.error('API key required');
        return NextResponse.json(
          { message: 'API key required' },
          { status: 401 }
        );
      }
      if (apiKey !== process.env.PROXY_API_KEY) {
        console.error('Invalid API key');
        return NextResponse.json(
          { message: 'Invalid API key' },
          { status: 403 }
        );
      }
    }

    // Then check Supabase auth if no API key provided
    if (!apiKey) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.error('Unauthorized');
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
    }

    if (!url) {
      return new NextResponse('URL is required', { status: 400 });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return new NextResponse('Failed to fetch content', {
        status: response.status,
      });
    }

    // Handle Excel files
    if (url.match(/\.(xlsx|xls)$/i)) {
      const arrayBuffer = await response.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename=dataset.xlsx',
        },
      });
    }

    // Handle CSV files
    if (url.match(/\.csv$/i)) {
      const buffer = await response.arrayBuffer();
      // Try to detect BOM for UTF-16/UTF-8
      const firstBytes = new Uint8Array(buffer.slice(0, 4));
      let decoder;

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
        // Try windows-1258 for Vietnamese or fallback to utf-8
        try {
          decoder = new TextDecoder('windows-1258');
        } catch {
          decoder = new TextDecoder('utf-8');
        }
      }

      const text = decoder.decode(buffer);
      return new NextResponse(text, {
        headers: {
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
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new NextResponse(`Proxy error: ${error}`, { status: 500 });
  }
}
