import { describe, expect, it } from 'vitest';
import { type MiraAdmissionInput, miraDemoAdmission } from './demo-admission';

function input(): MiraAdmissionInput {
  return {
    actor: {
      id: 'actor',
      email: 'demo@tuturuuu.com',
      email_confirmed_at: '2026-11-01T00:00:00Z',
      identities: [{ provider: 'email', identity_data: {} }],
    },
    workspaceId: 'workspace',
    meetingId: 'meeting',
    workspaceMember: true,
    admitted: true,
    explicitEnable: true,
    disabled: false,
    personalWorkspace: true,
    workspaceOwnerId: 'actor',
    attestation: null,
  };
}

describe('Mira server admission', () => {
  it.each(['demo@tuturuuu.com'])(
    'permits authoritative verified exact-domain identity %s in its own Personal workspace without attestation',
    (email) => {
      const request = input();
      request.actor!.email = email;
      expect(miraDemoAdmission(request)).toEqual({
        allowed: true,
        authority: 'verified-personal',
        payer: 'tuturuuu',
      });
    }
  );

  it.each([
    'demo@sub.tuturuuu.com',
    'demo@tuturuuu.com.example',
    'demo@tuturuuuXcom',
    'demo@tuturuuu.com ',
    'demo@example.com',
    'demo@xwf.tuturuuu.com',
  ])('does not grant the internal exception to %s', (email) => {
    const request = input();
    request.actor!.email = email;
    expect(miraDemoAdmission(request).allowed).toBe(false);
  });

  it('requires verification and preserves explicit-enable and kill-switch checks', () => {
    const request = input();
    expect(
      miraDemoAdmission({
        ...request,
        actor: { ...request.actor!, email_confirmed_at: null },
      }).allowed
    ).toBe(false);
    for (const disabled of [true, undefined, 'false', 0, null])
      expect(miraDemoAdmission({ ...request, disabled }).allowed).toBe(false);
    for (const explicitEnable of [false, undefined, 'true', 1, null])
      expect(miraDemoAdmission({ ...request, explicitEnable }).allowed).toBe(
        false
      );
  });

  it('does not broaden membership or participation for internal accounts', () => {
    const request = input();
    expect(
      miraDemoAdmission({ ...request, workspaceMember: false }).allowed
    ).toBe(false);
    expect(miraDemoAdmission({ ...request, admitted: false }).allowed).toBe(
      false
    );
    expect(miraDemoAdmission({ ...request, actor: null }).allowed).toBe(false);
  });

  it('never grants a staff Personal exception in another owner or team workspace', () => {
    const request = input();
    expect(
      miraDemoAdmission({ ...request, workspaceOwnerId: 'other' }).allowed
    ).toBe(false);
    expect(
      miraDemoAdmission({ ...request, personalWorkspace: false }).allowed
    ).toBe(false);
    expect(
      miraDemoAdmission({
        ...request,
        actor: { ...request.actor!, identities: [] },
      }).allowed
    ).toBe(false);
  });

  it('requires an actual admin attestation outside the staff-owned Personal exception', () => {
    const request = input();
    request.actor!.email = 'demo@example.com';
    request.personalWorkspace = false;
    request.paidAccount = true;
    expect(miraDemoAdmission(request)).toEqual({
      allowed: false,
      reason: 'workspace',
    });
    request.attestation = {
      workspaceId: request.workspaceId,
      actorId: 'admin',
      attestedAt: 1000,
      audience: 'adults-only',
    };
    expect(miraDemoAdmission(request)).toEqual({
      allowed: true,
      authority: 'workspace-admin',
      payer: 'account',
    });
    expect(
      miraDemoAdmission({
        ...request,
        attestation: { ...request.attestation, workspaceId: 'other' },
      }).allowed
    ).toBe(false);
  });

  it('admits paid Personal tiers to pay with their own credits, never free accounts', () => {
    const request = input();
    request.actor!.email = 'paid@example.com';
    request.attestation = {
      workspaceId: request.workspaceId,
      actorId: 'actor',
      attestedAt: 1000,
      audience: 'adults-only',
    };
    for (const paidAccount of [false, undefined, 'true', 1, null])
      expect(miraDemoAdmission({ ...request, paidAccount })).toEqual({
        allowed: false,
        reason: 'account',
      });
    expect(miraDemoAdmission({ ...request, paidAccount: true })).toEqual({
      allowed: true,
      authority: 'workspace-admin',
      payer: 'account',
    });
    // A paid account's own Personal workspace still needs its 18+ attestation.
    expect(
      miraDemoAdmission({ ...request, paidAccount: true, attestation: null })
    ).toEqual({ allowed: false, reason: 'workspace' });
    expect(
      miraDemoAdmission({
        ...request,
        paidAccount: true,
        actor: { ...request.actor!, email_confirmed_at: null },
      })
    ).toEqual({ allowed: false, reason: 'account' });
  });

  it('bills staff to the root workspace even in an attested team workspace', () => {
    const request = input();
    request.personalWorkspace = false;
    request.attestation = {
      workspaceId: request.workspaceId,
      actorId: 'admin',
      attestedAt: 1000,
      audience: 'adults-only',
    };
    expect(miraDemoAdmission(request)).toEqual({
      allowed: true,
      authority: 'workspace-admin',
      payer: 'tuturuuu',
    });
    expect(miraDemoAdmission({ ...request, attestation: null })).toEqual({
      allowed: false,
      reason: 'workspace',
    });
  });
});
