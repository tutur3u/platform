import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface DuckDuckGoImageResult {
  image?: unknown;
  thumbnail?: unknown;
  title?: unknown;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (!query) {
    return NextResponse.json(
      { message: 'Query parameter q is required.' },
      { status: 400 }
    );
  }

  if (query.length > 100) {
    return NextResponse.json(
      { message: 'Query must be 100 characters or fewer.' },
      { status: 400 }
    );
  }

  try {
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // 1. Fetch the search page to extract the VQD token
    const searchPageResponse = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': userAgent,
        },
      }
    );

    if (!searchPageResponse.ok) {
      return NextResponse.json(
        { message: 'Failed to connect to search engine for token extraction.' },
        { status: 502 }
      );
    }

    const html = await searchPageResponse.text();
    const vqdMatch = html.match(/vqd=['"]?([^'"&>]+)['"]?/);

    if (!vqdMatch) {
      return NextResponse.json(
        { message: 'Failed to extract token from search engine.' },
        { status: 502 }
      );
    }

    const vqd = vqdMatch[1];

    // 2. Fetch the image search results using the token
    const imagesResponse = await fetch(
      `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${vqd}&o=json`,
      {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/json',
          Referer: 'https://duckduckgo.com/',
        },
      }
    );

    if (!imagesResponse.ok) {
      return NextResponse.json(
        { message: 'Failed to retrieve images from search engine.' },
        { status: 502 }
      );
    }

    const data = (await imagesResponse.json()) as { results?: unknown };

    if (!data.results || !Array.isArray(data.results)) {
      return NextResponse.json({ results: [] });
    }

    const results = data.results
      .map((item) => {
        const result =
          item && typeof item === 'object' && !Array.isArray(item)
            ? (item as DuckDuckGoImageResult)
            : {};

        return {
          image: typeof result.image === 'string' ? result.image : '',
          thumbnail:
            typeof result.thumbnail === 'string' ? result.thumbnail : '',
          title: typeof result.title === 'string' ? result.title : '',
        };
      })
      .filter((item) => item.image && item.thumbnail)
      .slice(0, 15);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Failed to search images:', error);
    return NextResponse.json(
      { message: 'Internal server error while searching images.' },
      { status: 500 }
    );
  }
}
