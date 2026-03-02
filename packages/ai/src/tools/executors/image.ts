import type { MiraToolContext } from '../mira-tools';

const IMAGEN_4_FAST = 'google/imagen-4.0-fast-generate-001';
const IMAGEN_4 = 'google/imagen-4.0-generate-001';

export async function executeGenerateImage(
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<unknown> {
  const billingWsId = ctx.creditWsId ?? ctx.wsId;
  const prompt = args.prompt as string;
  const aspectRatio = (args.aspectRatio as string) ?? '1:1';

  const resolvedModel =
    (args.model as string) ??
    (await (async () => {
      const { getWorkspaceTier } = await import(
        '@tuturuuu/utils/workspace-helper'
      );
      const tier = await getWorkspaceTier(billingWsId, { useAdmin: true });
      return tier === 'FREE' ? IMAGEN_4_FAST : IMAGEN_4;
    })());
  const selectedModel = resolvedModel;

  const { checkAiCredits } = await import('../../credits/check-credits');
  const {
    commitFixedAiCreditReservation,
    releaseFixedAiCreditReservation,
    reserveFixedAiCredits,
  } = await import('../../credits/reservations');
  let commitResult: Awaited<
    ReturnType<typeof commitFixedAiCreditReservation>
  > | null = null;
  const { createAdminClient } = await import('@tuturuuu/supabase/next/server');
  const creditCheck = await checkAiCredits(
    billingWsId,
    selectedModel,
    'image_generation',
    { userId: ctx.userId }
  );

  if (!creditCheck.allowed) {
    const errorMessages: Record<string, string> = {
      FEATURE_NOT_ALLOWED:
        'Image generation is not available on your current plan.',
      MODEL_NOT_ALLOWED: `The model ${selectedModel} is not enabled for your workspace.`,
      CREDITS_EXHAUSTED: 'You have run out of AI credits for image generation.',
      NO_ALLOCATION: 'Image generation is not configured for your workspace.',
    };
    return {
      success: false,
      error:
        errorMessages[creditCheck.errorCode ?? ''] ??
        'Image generation is not available. Please check your AI credit settings.',
    };
  }

  const sbAdmin = await createAdminClient();
  const reservationMetadata = {
    aspectRatio,
    model: selectedModel,
    feature: 'image_generation',
  };
  // Full metadata including prompt for storage — never logged directly.
  const fullReservationMetadata = {
    prompt,
    ...reservationMetadata,
  };

  const reservation = await reserveFixedAiCredits(
    {
      wsId: billingWsId,
      userId: ctx.userId,
      amount: 1,
      modelId: selectedModel,
      feature: 'image_generation',
      metadata: fullReservationMetadata,
    },
    sbAdmin
  );

  if (!reservation.success || !reservation.reservationId) {
    return {
      success: false,
      error:
        reservation.errorCode === 'INSUFFICIENT_CREDITS'
          ? 'You have run out of AI credits for image generation.'
          : 'Failed to reserve AI credits for image generation.',
    };
  }

  const { generateImage, gateway } = await import('ai');

  const imageId = crypto.randomUUID();
  const storagePath = `${ctx.wsId}/mira/images/${imageId}.png`;

  try {
    const { image } = await generateImage({
      model: gateway.image(selectedModel),
      prompt,
      aspectRatio: aspectRatio as `${number}:${number}`,
    });

    const { error: uploadError } = await sbAdmin.storage
      .from('workspaces')
      .upload(storagePath, image.uint8Array, {
        contentType: 'image/png',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: urlData, error: urlError } = await sbAdmin.storage
      .from('workspaces')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 30);

    if (urlError || !urlData) {
      throw new Error(
        `Signed URL failed: ${urlError?.message ?? 'No data returned'}`
      );
    }

    commitResult = await commitFixedAiCreditReservation(
      reservation.reservationId,
      {
        ...fullReservationMetadata,
        storagePath,
      },
      sbAdmin
    );

    if (!commitResult.success) {
      throw new Error('Failed to finalize AI credit deduction.');
    }

    return {
      success: true,
      imageUrl: urlData.signedUrl,
      storagePath,
      prompt,
    };
  } catch (error) {
    let commitOrReleaseError: Error | null = null;

    // Attempt to release the reservation first, with defensive error handling.
    // Releasing before storage cleanup ensures we know the reservation's final
    // state before deciding whether to keep or remove the image.
    let releaseResult: Awaited<
      ReturnType<typeof releaseFixedAiCreditReservation>
    > | null = null;
    try {
      releaseResult = await releaseFixedAiCreditReservation(
        reservation.reservationId,
        {
          ...reservationMetadata,
          storagePath,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown image generation error',
        },
        sbAdmin
      );

      if (!releaseResult.success) {
        console.error('Failed to release AI credit reservation', {
          reservationId: reservation.reservationId,
          storagePath,
          releaseResult,
          commitResult,
        });
        commitOrReleaseError = new Error(
          `AI credit reservation release failed (${releaseResult.errorCode ?? 'UNKNOWN'}): ${JSON.stringify(
            {
              commitResult,
              releaseResult,
            }
          )}`
        );
      }
    } catch (releaseError) {
      console.error('Failed to release AI credit reservation', {
        reservationId: reservation.reservationId,
        storagePath,
        releaseError:
          releaseError instanceof Error
            ? releaseError.message
            : String(releaseError),
      });
      commitOrReleaseError = new Error(
        `Failed to release reservation: ${
          releaseError instanceof Error
            ? releaseError.message
            : 'Unknown release error'
        }`
      );
    }

    // Only delete the image if the credit commit did NOT succeed AND
    // the reservation was not already committed (confirmed by release).
    // If commit succeeded (e.g. HTTP response was lost), keep the image
    // so the user isn't charged for nothing.
    const alreadyCommitted =
      releaseResult?.errorCode === 'RESERVATION_ALREADY_COMMITTED';
    if (storagePath && !commitResult?.success && !alreadyCommitted) {
      const { error: removeError } = await sbAdmin.storage
        .from('workspaces')
        .remove([storagePath]);
      if (removeError) {
        console.error('Failed to cleanup image upload', {
          storagePath,
          error: removeError.message,
        });
      }
    }

    return {
      success: false,
      error: commitOrReleaseError?.message
        ? `${commitOrReleaseError.message} ${
            error instanceof Error ? `Original error: ${error.message}` : ''
          }`.trim()
        : error instanceof Error
          ? error.message
          : 'Image generation failed. Please try again.',
    };
  }
}
