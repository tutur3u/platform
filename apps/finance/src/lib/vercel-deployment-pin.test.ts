import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { pinFinanceDeployment } from './vercel-deployment-pin';

describe('pinFinanceDeployment', () => {
  it('pins a Finance session when Vercel skew protection is enabled', () => {
    const request = new NextRequest(
      'https://finance.tuturuuu.com/workspace/invoices'
    );
    const response = pinFinanceDeployment(request, NextResponse.next(), {
      VERCEL_DEPLOYMENT_ID: 'dpl_current',
      VERCEL_SKEW_PROTECTION_ENABLED: '1',
    });

    expect(response.cookies.get('__vdpl')).toMatchObject({
      name: '__vdpl',
      value: 'dpl_current',
    });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Path=/');
    expect(response.headers.get('set-cookie')).toContain('SameSite=strict');
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });

  it('preserves the deployment selected earlier in the browser session', () => {
    const request = new NextRequest(
      'https://finance.tuturuuu.com/workspace/invoices',
      { headers: { cookie: '__vdpl=dpl_previous' } }
    );
    const response = pinFinanceDeployment(request, NextResponse.next(), {
      VERCEL_DEPLOYMENT_ID: 'dpl_current',
      VERCEL_SKEW_PROTECTION_ENABLED: '1',
    });

    expect(response.cookies.get('__vdpl')).toBeUndefined();
  });

  it('does not set a deployment cookie outside an enabled Vercel project', () => {
    const request = new NextRequest(
      'https://finance.tuturuuu.com/workspace/invoices'
    );

    expect(
      pinFinanceDeployment(request, NextResponse.next(), {
        VERCEL_DEPLOYMENT_ID: 'dpl_current',
        VERCEL_SKEW_PROTECTION_ENABLED: undefined,
      }).cookies.get('__vdpl')
    ).toBeUndefined();
    expect(
      pinFinanceDeployment(request, NextResponse.next(), {
        VERCEL_DEPLOYMENT_ID: undefined,
        VERCEL_SKEW_PROTECTION_ENABLED: '1',
      }).cookies.get('__vdpl')
    ).toBeUndefined();
  });
});
