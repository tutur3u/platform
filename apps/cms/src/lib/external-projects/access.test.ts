import { describe, expect, it, vi } from 'vitest';
import {
  hasCmsCommerceFinanceOverviewPermission,
  hasCmsCommerceInsightsPermission,
  hasCmsCommerceProductReadPermission,
  hasCmsCommerceStorefrontPublishPermission,
  hasCmsCommerceStorefrontReadPermission,
  hasCmsConnectedChatReadPermission,
  sanitizeCmsBindingSettings,
} from './access';

function permissionsWith(values: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      values.includes(permission)
    ),
  } as never;
}

describe('CMS commerce workspace permissions', () => {
  it('requires finance stats access for commerce overview', () => {
    expect(
      hasCmsCommerceFinanceOverviewPermission(
        permissionsWith(['publish_external_projects'])
      )
    ).toBe(false);
    expect(
      hasCmsCommerceFinanceOverviewPermission(
        permissionsWith(['view_finance_stats'])
      )
    ).toBe(true);
  });

  it('requires catalog and stock access for product reads', () => {
    expect(
      hasCmsCommerceProductReadPermission(
        permissionsWith(['view_inventory_catalog'])
      )
    ).toBe(false);
    expect(
      hasCmsCommerceProductReadPermission(
        permissionsWith(['view_inventory_catalog', 'view_inventory_stock'])
      )
    ).toBe(true);
    expect(
      hasCmsCommerceProductReadPermission(permissionsWith(['manage_inventory']))
    ).toBe(true);
  });

  it('separates storefront read and publish permissions', () => {
    expect(
      hasCmsCommerceStorefrontReadPermission(
        permissionsWith(['view_inventory_catalog'])
      )
    ).toBe(true);
    expect(
      hasCmsCommerceStorefrontPublishPermission(
        permissionsWith(['view_inventory_catalog'])
      )
    ).toBe(false);
    expect(
      hasCmsCommerceStorefrontPublishPermission(
        permissionsWith(['manage_inventory_catalog'])
      )
    ).toBe(true);
    expect(
      hasCmsCommerceStorefrontPublishPermission(
        permissionsWith(['manage_inventory'])
      )
    ).toBe(true);
  });

  it('allows insights through analytics or product read permissions', () => {
    expect(
      hasCmsCommerceInsightsPermission(
        permissionsWith(['publish_external_projects'])
      )
    ).toBe(false);
    expect(
      hasCmsCommerceInsightsPermission(
        permissionsWith(['view_inventory_analytics'])
      )
    ).toBe(true);
    expect(
      hasCmsCommerceInsightsPermission(
        permissionsWith(['view_inventory_catalog', 'view_inventory_stock'])
      )
    ).toBe(true);
  });
});

describe('CMS binding serialization', () => {
  it('removes connected-chat configuration from general studio payloads', () => {
    expect(
      sanitizeCmsBindingSettings({
        chat: {
          bridgeBaseUrl: 'https://bridge.example.com',
          enabled: true,
        },
        cmsSite: { template: { kind: 'standard-site', version: 1 } },
      })
    ).toEqual({
      cmsSite: { template: { kind: 'standard-site', version: 1 } },
    });
  });
});

describe('CMS connected chat permissions', () => {
  it('allows chat viewers without granting general project editing access', () => {
    expect(
      hasCmsConnectedChatReadPermission(permissionsWith(['view_chat']))
    ).toBe(true);
    expect(
      hasCmsConnectedChatReadPermission(
        permissionsWith(['publish_external_projects'])
      )
    ).toBe(false);
  });
});
