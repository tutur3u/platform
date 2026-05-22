import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkAiCredits: vi.fn(),
  commitFixedAiCreditReservation: vi.fn(),
  createAdminClient: vi.fn(),
  createSignedUrl: vi.fn(),
  gatewayImage: vi.fn(),
  generateImage: vi.fn(),
  googleImage: vi.fn(),
  releaseFixedAiCreditReservation: vi.fn(),
  reserveFixedAiCredits: vi.fn(),
  resolvePlanModel: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: Object.assign(vi.fn(), {
    image: (...args: Parameters<typeof mocks.googleImage>) =>
      mocks.googleImage(...args),
  }),
}));

vi.mock('ai', () => ({
  gateway: {
    image: (...args: Parameters<typeof mocks.gatewayImage>) =>
      mocks.gatewayImage(...args),
  },
  generateImage: (...args: Parameters<typeof mocks.generateImage>) =>
    mocks.generateImage(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('../../credits/check-credits', () => ({
  checkAiCredits: (...args: Parameters<typeof mocks.checkAiCredits>) =>
    mocks.checkAiCredits(...args),
}));

vi.mock('../../credits/reservations', () => ({
  commitFixedAiCreditReservation: (
    ...args: Parameters<typeof mocks.commitFixedAiCreditReservation>
  ) => mocks.commitFixedAiCreditReservation(...args),
  releaseFixedAiCreditReservation: (
    ...args: Parameters<typeof mocks.releaseFixedAiCreditReservation>
  ) => mocks.releaseFixedAiCreditReservation(...args),
  reserveFixedAiCredits: (
    ...args: Parameters<typeof mocks.reserveFixedAiCredits>
  ) => mocks.reserveFixedAiCredits(...args),
}));

vi.mock('../../credits/resolve-plan-model', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../credits/resolve-plan-model')>();

  return {
    ...actual,
    resolvePlanModel: (...args: Parameters<typeof mocks.resolvePlanModel>) =>
      mocks.resolvePlanModel(...args),
  };
});

import { executeGenerateImage } from './image';

describe('executeGenerateImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePlanModel.mockResolvedValue({
      allocationId: 'allocation-1',
      modelId: 'google/imagen-4.0-generate-001',
      source: 'requested',
      tier: 'PRO',
    });
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      maxOutputTokens: null,
      remainingCredits: 100,
    });
    mocks.reserveFixedAiCredits.mockResolvedValue({
      reservationId: 'reservation-1',
      success: true,
    });
    mocks.commitFixedAiCreditReservation.mockResolvedValue({ success: true });
    mocks.createAdminClient.mockResolvedValue({
      storage: {
        from: () => ({
          createSignedUrl: mocks.createSignedUrl,
          upload: mocks.upload,
        }),
      },
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/generated.png' },
      error: null,
    });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.googleImage.mockReturnValue({
      modelId: 'imagen-4.0-generate-001',
      provider: 'google',
    });
    mocks.gatewayImage.mockReturnValue({
      modelId: 'google/imagen-4.0-generate-001',
      provider: 'gateway',
    });
    mocks.generateImage.mockResolvedValue({
      image: { uint8Array: new Uint8Array([1, 2, 3]) },
    });
  });

  it('uses the native Google image provider for Google image models', async () => {
    const result = await executeGenerateImage({ prompt: 'Draw a roadmap' }, {
      creditWsId: 'workspace-1',
      userId: 'user-1',
      wsId: 'workspace-1',
    } as never);

    expect(result).toMatchObject({
      success: true,
      imageUrl: 'https://example.com/generated.png',
    });
    expect(mocks.googleImage).toHaveBeenCalledWith('imagen-4.0-generate-001');
    expect(mocks.gatewayImage).not.toHaveBeenCalled();
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: {
          modelId: 'imagen-4.0-generate-001',
          provider: 'google',
        },
      })
    );
  });
});
