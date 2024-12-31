import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return new NextResponse('URL is required', { status: 400 });
    }

    // Validate URL is an Excel file
    if (!url.match(/\.(xlsx|xls)$/i)) {
      return new NextResponse('URL must point to an Excel file', {
        status: 400,
      });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return new NextResponse('Failed to fetch file', {
        status: response.status,
      });
    }

    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename=dataset.xlsx',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}
