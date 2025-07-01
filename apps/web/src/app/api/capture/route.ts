import { NextResponse } from 'next/server';

const ocrServiceUrl = process.env.OCR_SERVICE_URL || 'http://localhost:5500';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageData } = body;

    if (!imageData) {
      return NextResponse.json(
        { error: 'Image data is required' },
        { status: 400 }
      );
    }

    // Forward the request to the OCR service
    const response = await fetch(ocrServiceUrl + '/capture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageData }),
    });

    if (!response.ok) {
      throw new Error('OCR service request failed');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 400 }
    );
  }
}
