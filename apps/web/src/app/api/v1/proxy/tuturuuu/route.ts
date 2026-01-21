import { NextResponse } from 'next/server';
import { DEV_MODE } from '@/constants/common';

const TUTURUUU_API_ENDPOINT = 'https://tuturuuu.com/api/v1';

/**
 * Proxy route to avoid CORS issues when fetching from Tuturuuu production API.
 *
 * The browser cannot directly call tuturuuu.com due to CORS restrictions.
 * This server-side proxy makes the request on behalf of the client.
 *
 * Usage:
 *   GET /api/v1/proxy/tuturuuu?path=/workspaces/[id]
 *   Headers: X-Tuturuuu-Api-Key: <api-key>
 */
export async function GET(request: Request) {
  if (!DEV_MODE) {
    return NextResponse.json(
      { message: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json(
        { message: 'Missing path query parameter' },
        { status: 400 }
      );
    }

    // Get the API key from custom header
    const apiKey = request.headers.get('X-Tuturuuu-Api-Key');

    if (!apiKey) {
      return NextResponse.json(
        { message: 'Missing X-Tuturuuu-Api-Key header' },
        { status: 401 }
      );
    }

    // Build the full URL to Tuturuuu API
    const tuturuuuUrl = `${TUTURUUU_API_ENDPOINT}${path}`;

    // Forward any additional query parameters (except 'path')
    const forwardParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== 'path') {
        forwardParams.append(key, value);
      }
    });

    const finalUrl =
      forwardParams.toString().length > 0
        ? `${tuturuuuUrl}?${forwardParams.toString()}`
        : tuturuuuUrl;

    // Make the request to Tuturuuu API using Bearer token (SDK authentication)
    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      // Non-JSON response (likely an error page)
      const text = await response.text();
      console.error(
        'Tuturuuu API returned non-JSON response:',
        text.substring(0, 200)
      );
      return NextResponse.json(
        {
          message: 'Tuturuuu API returned non-JSON response',
          status: response.status,
        },
        { status: response.status || 502 }
      );
    }

    // Get the response data
    const data = await response.json();

    // Return the response with the same status code
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error in Tuturuuu proxy:', error);
    return NextResponse.json(
      { message: 'Failed to proxy request to Tuturuuu API' },
      { status: 500 }
    );
  }
}
