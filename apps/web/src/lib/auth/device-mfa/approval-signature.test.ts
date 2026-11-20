import { generateKeyPairSync, sign } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  type ApprovalSignatureInput,
  approvalSignatureMessage,
  verifyApprovalKeySignature,
} from './approval-signature';

vi.mock('server-only', () => ({}));

const input = {
  id: 'c7679660-b38b-4f3d-8e99-45eb2dcaffcd',
  nonce: 'KfY5Ffne33EibYJql4vaRa13ZpBQqFN2xet6-SvLM18',
  requesterSessionId: '607a83bf-9af4-45bd-9487-7baf18d7ad9d',
  decidingSessionId: 'ff395a68-3874-4b7a-bb62-98a495517234',
  expiresAt: '2026-11-20T06:44:57.012+00:00',
  action: 'approve',
  value: '03',
} satisfies ApprovalSignatureInput;

it('verifies the exact bytes signed by Native Approval', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const encodedKey = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');

  const signed = Buffer.from(
    '["tuturuuu.mobile-approval.v2",' +
      '"c7679660-b38b-4f3d-8e99-45eb2dcaffcd",' +
      '"KfY5Ffne33EibYJql4vaRa13ZpBQqFN2xet6-SvLM18",' +
      '"607a83bf-9af4-45bd-9487-7baf18d7ad9d",' +
      '"ff395a68-3874-4b7a-bb62-98a495517234",' +
      '"approve","03","2026-11-20T06:44:57.012+00:00"]'
  );
  const signature = sign('sha256', signed, privateKey).toString('base64url');
  expect(approvalSignatureMessage(input)).toEqual(signed);
  expect(verifyApprovalKeySignature(encodedKey, input, signature)).toBe(true);
  for (const change of [
    { id: 'e7679660-b38b-4f3d-8e99-45eb2dcaffcd' },
    { nonce: 'LfY5Ffne33EibYJql4vaRa13ZpBQqFN2xet6-SvLM18' },
    { requesterSessionId: input.decidingSessionId },
    { decidingSessionId: input.requesterSessionId },
    { expiresAt: '2026-11-20T06:44:57.012Z' },
    { action: 'reject' as const, value: 'deny' },
    { value: '08' },
    { value: '' },
    { action: '' as ApprovalSignatureInput['action'] },
  ]) {
    expect(
      verifyApprovalKeySignature(encodedKey, { ...input, ...change }, signature)
    ).toBe(false);
  }
});
