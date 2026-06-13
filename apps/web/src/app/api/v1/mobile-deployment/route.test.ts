import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileDeploymentValidationError } from '@/lib/mobile-deployment/validation';

const {
  authorizeMobileDeploymentAdminMock,
  clearMobileDeploymentEnvKeyMock,
  clearMobileDeploymentScalarMock,
  listMobileDeploymentStateMock,
  MobileDeploymentStoreErrorMock,
  saveMobileDeploymentEnvFileMock,
  saveMobileDeploymentEnvKeyMock,
  saveMobileDeploymentScalarMock,
  validateJsonMutationMock,
} = vi.hoisted(() => ({
  authorizeMobileDeploymentAdminMock: vi.fn(),
  clearMobileDeploymentEnvKeyMock: vi.fn(),
  clearMobileDeploymentScalarMock: vi.fn(),
  listMobileDeploymentStateMock: vi.fn(),
  MobileDeploymentStoreErrorMock: class MobileDeploymentStoreError extends Error {
    constructor(
      message: string,
      public readonly status = 400,
      public readonly code = 'mobile_deployment_error'
    ) {
      super(message);
      this.name = 'MobileDeploymentStoreError';
    }
  },
  saveMobileDeploymentEnvFileMock: vi.fn(),
  saveMobileDeploymentEnvKeyMock: vi.fn(),
  saveMobileDeploymentScalarMock: vi.fn(),
  validateJsonMutationMock: vi.fn(),
}));

vi.mock('@/lib/mobile-deployment/access', () => ({
  authorizeMobileDeploymentAdmin: authorizeMobileDeploymentAdminMock,
  validateJsonMutation: validateJsonMutationMock,
}));

vi.mock('@/lib/mobile-deployment/store', () => ({
  clearMobileDeploymentEnvKey: clearMobileDeploymentEnvKeyMock,
  clearMobileDeploymentScalar: clearMobileDeploymentScalarMock,
  listMobileDeploymentState: listMobileDeploymentStateMock,
  MobileDeploymentStoreError: MobileDeploymentStoreErrorMock,
  saveMobileDeploymentEnvFile: saveMobileDeploymentEnvFileMock,
  saveMobileDeploymentEnvKey: saveMobileDeploymentEnvKeyMock,
  saveMobileDeploymentScalar: saveMobileDeploymentScalarMock,
}));

import { GET, PUT } from './route';

const db = { schema: vi.fn() };
const state = {
  activeVersion: null,
  auditEvents: [],
  draftVersion: null,
  envKeys: [],
  fileArtifacts: [],
  scalarValues: [],
  tokens: [],
};

function request(body: unknown) {
  return new Request('http://localhost/api/v1/mobile-deployment', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
}

describe('mobile deployment route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeMobileDeploymentAdminMock.mockResolvedValue({
      db,
      ok: true,
      userId: 'user-1',
    });
    validateJsonMutationMock.mockReturnValue(null);
    listMobileDeploymentStateMock.mockResolvedValue(state);
    saveMobileDeploymentEnvFileMock.mockResolvedValue(state);
    saveMobileDeploymentEnvKeyMock.mockResolvedValue(state);
    saveMobileDeploymentScalarMock.mockResolvedValue(state);
    clearMobileDeploymentEnvKeyMock.mockResolvedValue(state);
    clearMobileDeploymentScalarMock.mockResolvedValue(state);
  });

  it('returns mobile deployment state', async () => {
    const response = await GET(
      new Request('http://localhost/api/v1/mobile-deployment')
    );

    expect(response.status).toBe(200);
    expect(listMobileDeploymentStateMock).toHaveBeenCalledWith(db);
  });

  it('saves a single env key', async () => {
    const response = await PUT(
      request({
        action: 'save_env_key',
        name: 'API_BASE_URL',
        value: 'https://tuturuuu.com',
      })
    );

    expect(response.status).toBe(200);
    expect(saveMobileDeploymentEnvKeyMock).toHaveBeenCalledWith({
      db,
      name: 'API_BASE_URL',
      userId: 'user-1',
      value: 'https://tuturuuu.com',
    });
  });

  it('clears a single env key', async () => {
    const response = await PUT(
      request({ action: 'clear_env_key', name: 'API_BASE_URL' })
    );

    expect(response.status).toBe(200);
    expect(clearMobileDeploymentEnvKeyMock).toHaveBeenCalledWith({
      db,
      name: 'API_BASE_URL',
      userId: 'user-1',
    });
  });

  it('clears a scalar key', async () => {
    const response = await PUT(
      request({ action: 'clear_scalar', name: 'ANDROID_KEYSTORE_ALIAS' })
    );

    expect(response.status).toBe(200);
    expect(clearMobileDeploymentScalarMock).toHaveBeenCalledWith({
      db,
      name: 'ANDROID_KEYSTORE_ALIAS',
      userId: 'user-1',
    });
  });

  it('returns validation errors as bad requests', async () => {
    saveMobileDeploymentEnvKeyMock.mockRejectedValue(
      new MobileDeploymentValidationError(
        'Invalid mobile deployment env value',
        ['API_BASE_URL: Secret values must be single-line UTF-8 strings']
      )
    );

    const response = await PUT(
      request({
        action: 'save_env_key',
        name: 'API_BASE_URL',
        value: 'first\nsecond',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'mobile_deployment_validation_error',
      errors: ['API_BASE_URL: Secret values must be single-line UTF-8 strings'],
    });
  });

  it('rejects unknown actions', async () => {
    const response = await PUT(
      request({ action: 'save_env_key', name: 'API_BASE_URL' })
    );

    expect(response.status).toBe(400);
    expect(saveMobileDeploymentEnvKeyMock).not.toHaveBeenCalled();
  });
});
