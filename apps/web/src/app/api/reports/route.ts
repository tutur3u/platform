import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const product = formData.get('product');
    const suggestion = formData.get('suggestion');
    if (
      typeof product !== 'string' ||
      typeof suggestion !== 'string' ||
      !product.trim() ||
      !suggestion.trim()
    ) {
      return NextResponse.json(
        { success: false, message: 'product and suggestion are required.' },
        { status: 400 }
      );
    }

    // Extract images (max 5), validate type/size
    const ALLOWED_IMAGE_TYPES = new Set([
      'image/png',
      'image/jpeg',
      'image/webp',
    ]);
    const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    const images: File[] = [];
    for (let i = 0; i < 5; i++) {
      const value = formData.get(`image_${i}`);
      if (value instanceof File) {
        if (!ALLOWED_IMAGE_TYPES.has(value.type)) {
          return NextResponse.json(
            {
              success: false,
              message: `Unsupported image type: ${value.type}`,
            },
            { status: 400 }
          );
        }
        if (value.size > MAX_IMAGE_SIZE_BYTES) {
          return NextResponse.json(
            { success: false, message: 'Image exceeds 5MB limit.' },
            { status: 400 }
          );
        }
        images.push(value);
      }
    }

    // TODO: Implement actual report submission logic
    // This could involve:
    // 1. Validating the data
    // 2. Uploading images to a storage service (AWS S3, Cloudinary, etc.)
    // 3. Saving the report to a database
    // 4. Sending notifications to the development team
    // 5. Creating a ticket in a project management system

    console.log('Report submitted:', {
      product,
      suggestion,
      imageCount: images.length,
      images: images.map((img) => ({
        name: img.name,
        size: img.size,
        type: img.type,
      })),
    });

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully',
      reportId: generateRandomUUID(), // Generate a unique ID
    });
  } catch (error) {
    console.error('Error processing report submission:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to submit report',
      },
      { status: 500 }
    );
  }
}
