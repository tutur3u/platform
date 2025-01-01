import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

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

    // Handle HTML content
    const text = await response.text();
    return new NextResponse(text, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new NextResponse('Error fetching content', { status: 500 });
  }
}
