import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const product = formData.get('product') as string;
    const suggestion = formData.get('suggestion') as string;

    // Extract images
    const images: File[] = [];
    for (let i = 0; i < 5; i++) {
      const image = formData.get(`image_${i}`) as File;
      if (image) {
        images.push(image);
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
