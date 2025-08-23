import {
  createAdminClient,
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import type { Product, SupportType } from '@tuturuuu/types/db';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { type NextRequest, NextResponse } from 'next/server';

// Runtime representation of the Product enum values
// This ensures we don't have to manually maintain the list
const VALID_PRODUCTS: readonly Product[] = [
  'web',
  'nova',
  'rewise',
  'calendar',
  'finance',
  'tudo',
  'tumeet',
  'shortener',
  'qr',
  'drive',
  'mail',
  'other',
] as const;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const product = formData.get('product');
    const suggestion = formData.get('suggestion');
    const type = formData.get('type');
    const subject = formData.get('subject');
    if (
      typeof product !== 'string' ||
      typeof suggestion !== 'string' ||
      typeof type !== 'string' ||
      typeof subject !== 'string' ||
      !product.trim() ||
      !suggestion.trim() ||
      !type.trim() ||
      !subject.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'product, suggestion, type and subject are required.',
        },
        { status: 400 }
      );
    }

    // Validate product value using the enum values
    if (!VALID_PRODUCTS.includes(product as Product)) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid product. Must be one of: ${VALID_PRODUCTS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Extract images (max 5), validate type/size
    const ALLOWED_IMAGE_TYPES = new Set([
      'image/png',
      'image/jpeg',
      'image/webp',
    ]);
    const MAX_IMAGE_SIZE_BYTES = 1024 * 1024; // 1MB
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
            { success: false, message: 'Image exceeds 1MB limit.' },
            { status: 400 }
          );
        }
        images.push(value);
      }
    }

    // Create Supabase client for database operations
    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get current user if authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('Auth error:', authError);
    }

    // Create support inquiry first and get the generated ID
    const { data: insertData, error: insertError } = await supabase
      .from('support_inquiries')
      .insert({
        name: 'Report Submission',
        email: user?.email || 'reports@tuturuuu.com',
        subject: subject as string,
        message: suggestion,
        type: type as SupportType,
        product: product as Product,
        creator_id: user?.id || undefined,
        images: [], // Will be updated after image uploads
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Error creating support inquiry:', insertError);
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to create support inquiry',
        },
        { status: 500 }
      );
    }

    const inquiryId = insertData.id;

    // Upload images to storage bucket if any
    const uploadedImageNames: string[] = [];

    if (images.length > 0) {
      // Use dynamic client for storage operations
      const storageClient = await createDynamicClient();

      for (const image of images) {
        try {
          // Generate unique filename
          const fileExtension = image.name.split('.').pop();
          const fileName = `${generateRandomUUID()}.${fileExtension}`;
          const storagePath = `${inquiryId}/${fileName}`;

          // Upload to support_inquiries bucket
          const { error: uploadError } = await storageClient.storage
            .from('support_inquiries')
            .upload(storagePath, image, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            console.error('Error uploading image:', uploadError);
            // Continue with other images even if one fails
            continue;
          }

          uploadedImageNames.push(fileName);
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
        }
      }

      // Update the support inquiry with image filenames
      if (uploadedImageNames.length > 0) {
        const { error: updateError } = await sbAdmin
          .from('support_inquiries')
          .update({ images: uploadedImageNames })
          .eq('id', inquiryId);

        if (updateError) {
          console.error(
            'Error updating support inquiry with images:',
            updateError
          );
          // Don't fail the entire request if image update fails
        }
      }
    }

    console.log('Report submitted successfully:', {
      inquiryId,
      product,
      suggestion,
      imageCount: images.length,
      uploadedImages: uploadedImageNames,
      userId: user?.id || 'anonymous',
      images: images.map((img) => ({
        name: img.name,
        size: img.size,
        type: img.type,
      })),
    });

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully',
      reportId: inquiryId,
      uploadedImages: uploadedImageNames,
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
