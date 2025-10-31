import {
  createAdminClient,
  createClient,
  createDynamicClient,
} from '@tuturuuu/supabase/next/server';
import type { Product, SupportType } from '@tuturuuu/types';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import { type NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

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

    // Extract media files (max 10), validate type/size
    const ALLOWED_IMAGE_TYPES = new Set([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
    ]);
    const ALLOWED_VIDEO_TYPES = new Set([
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ]);
    const MAX_MEDIA_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
    const MAX_FILES = 10;
    const mediaFiles: File[] = [];

    for (let i = 0; i < MAX_FILES; i++) {
      const value = formData.get(`media_${i}`);
      if (value instanceof File) {
        if (
          !ALLOWED_IMAGE_TYPES.has(value.type) &&
          !ALLOWED_VIDEO_TYPES.has(value.type)
        ) {
          return NextResponse.json(
            {
              success: false,
              message: `Unsupported file type: ${value.type}. Only images (PNG, JPEG, WebP, GIF) and videos (MP4, WebM, MOV) are allowed.`,
            },
            { status: 400 }
          );
        }
        if (value.size > MAX_MEDIA_SIZE_BYTES) {
          return NextResponse.json(
            { success: false, message: 'File exceeds 5MB limit.' },
            { status: 400 }
          );
        }
        mediaFiles.push(value);
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

    // Upload media files to storage bucket if any
    const uploadedMediaNames: string[] = [];

    if (mediaFiles.length > 0) {
      // Use dynamic client for storage operations
      const storageClient = await createDynamicClient();

      for (const file of mediaFiles) {
        try {
          let fileToUpload: File | Buffer = file;
          let contentType = file.type;

          // Compress images on the server side
          if (ALLOWED_IMAGE_TYPES.has(file.type)) {
            try {
              const arrayBuffer = await file.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);

              // Compress image with Sharp (70% quality)
              const compressedBuffer = await sharp(buffer)
                .resize(1920, 1920, {
                  fit: 'inside',
                  withoutEnlargement: true,
                })
                .jpeg({ quality: 70 })
                .toBuffer();

              fileToUpload = compressedBuffer;
              contentType = 'image/jpeg'; // Convert all images to JPEG for consistency
            } catch (compressionError) {
              console.error(
                'Image compression failed, using original:',
                compressionError
              );
              // Use original file if compression fails
            }
          }

          // Generate unique filename
          const fileExtension =
            contentType === 'image/jpeg' ? 'jpg' : file.name.split('.').pop();
          const fileName = `${generateRandomUUID()}.${fileExtension}`;
          const storagePath = `${inquiryId}/${fileName}`;

          // Upload to support_inquiries bucket
          const { error: uploadError } = await storageClient.storage
            .from('support_inquiries')
            .upload(storagePath, fileToUpload, {
              cacheControl: '3600',
              upsert: false,
              contentType,
            });

          if (uploadError) {
            console.error('Error uploading file:', uploadError);
            // Continue with other files even if one fails
            continue;
          }

          uploadedMediaNames.push(fileName);
        } catch (uploadError) {
          console.error('Error uploading file:', uploadError);
        }
      }

      // Update the support inquiry with media filenames
      if (uploadedMediaNames.length > 0) {
        const { error: updateError } = await sbAdmin
          .from('support_inquiries')
          .update({ images: uploadedMediaNames })
          .eq('id', inquiryId);

        if (updateError) {
          console.error(
            'Error updating support inquiry with media files:',
            updateError
          );
          // Don't fail the entire request if media update fails
        }
      }
    }

    console.log('Report submitted successfully:', {
      inquiryId,
      product,
      suggestion,
      mediaCount: mediaFiles.length,
      uploadedMedia: uploadedMediaNames,
      userId: user?.id || 'anonymous',
      mediaFiles: mediaFiles.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      })),
    });

    return NextResponse.json({
      success: true,
      message: 'Report submitted successfully',
      reportId: inquiryId,
      uploadedMedia: uploadedMediaNames,
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
