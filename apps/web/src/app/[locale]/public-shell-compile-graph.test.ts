import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), {
    encoding: 'utf8',
  });

const menuSource = source('src/app/[locale]/menu.tsx');
const mobileMenuSource = source('src/app/[locale]/mobile-menu.tsx');
const footerSource = source('src/components/layouts/Footer.tsx');
const navigationConfigSource = source(
  'src/app/[locale]/shared/navigation-config.tsx'
);
const userNavClientSource = source('src/app/[locale]/user-nav-client.tsx');
const reportProblemMenuItemSource = source(
  'src/app/[locale]/report-problem-menu-item.tsx'
);
const loginContentSource = source(
  'src/app/[locale]/(marketing)/login/login-content.tsx'
);
const loginFormSource = source('src/app/[locale]/(marketing)/login/form.tsx');
const loginPageSource = source('src/app/[locale]/(marketing)/login/page.tsx');
const loginConfirmationPartsSource = source(
  'src/app/[locale]/(marketing)/login/internal-app-account-confirmation-parts.tsx'
);
const aboutPageSource = source('src/app/[locale]/(marketing)/about/page.tsx');
const rootLayoutSource = source('src/app/[locale]/layout.tsx');
const timeTrackerLayoutSource = source(
  'src/app/[locale]/(dashboard)/[wsId]/time-tracker/layout.tsx'
);
const dropdownMenuSource = source(
  '../../packages/ui/src/components/ui/dropdown-menu.tsx'
);
const commonPrimitiveSources = [
  source('../../packages/ui/src/components/ui/breadcrumb.tsx'),
  source('../../packages/ui/src/components/ui/calendar.tsx'),
  source('../../packages/ui/src/components/ui/carousel.tsx'),
  source('../../packages/ui/src/components/ui/checkbox.tsx'),
  source('../../packages/ui/src/components/ui/color-picker.tsx'),
  source('../../packages/ui/src/components/ui/command.tsx'),
  source('../../packages/ui/src/components/ui/context-menu.tsx'),
  source('../../packages/ui/src/components/ui/pagination.tsx'),
  source('../../packages/ui/src/components/ui/radio-group.tsx'),
  source('../../packages/ui/src/components/ui/select.tsx'),
  source('../../packages/ui/src/components/ui/sidebar.tsx'),
  source('../../packages/ui/src/components/ui/toast.tsx'),
] as const;
const legalIconBoundarySources = [
  source('src/app/[locale]/(marketing)/acceptable-use/page.tsx'),
  source('src/app/[locale]/(marketing)/community-guidelines/page.tsx'),
  source('src/app/[locale]/(marketing)/privacy/page.tsx'),
  source('src/app/[locale]/(marketing)/terms/page.tsx'),
  source('src/components/legal/legal-page-layout.tsx'),
  source('src/components/legal/legal-section-card.tsx'),
  source('src/components/legal/legal-summary-card.tsx'),
  source('src/components/legal/legal-types.ts'),
  source('src/components/legal/table-of-contents.tsx'),
  source('src/components/legal/third-party-services-section.tsx'),
  source('src/data/legal/acceptable-use-sections.tsx'),
  source('src/data/legal/community-guidelines-sections.tsx'),
  source('src/data/legal/privacy-sections.tsx'),
  source('src/data/legal/terms-sections.tsx'),
  source('src/data/legal/third-party-providers.ts'),
] as const;
const productPageIconBoundarySources = [
  source('src/app/[locale]/(marketing)/products/ai/page.tsx'),
  source('src/app/[locale]/(marketing)/products/calendar/page.tsx'),
  source('src/app/[locale]/(marketing)/products/crm/page.tsx'),
  source('src/app/[locale]/(marketing)/products/documents/page.tsx'),
  source('src/app/[locale]/(marketing)/products/drive/page.tsx'),
  source('src/app/[locale]/(marketing)/products/finance/page.tsx'),
  source('src/app/[locale]/(marketing)/products/inventory/page.tsx'),
  source('src/app/[locale]/(marketing)/products/lms/page.tsx'),
  source('src/app/[locale]/(marketing)/products/mail/page.tsx'),
  source('src/app/[locale]/(marketing)/products/tasks/page.tsx'),
  source('src/app/[locale]/(marketing)/products/workflows/page.tsx'),
] as const;

function staticImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+['"]${escapedModulePath}['"];`,
    'mu'
  );
}

describe('public shell compile graph', () => {
  it('keeps the mobile menu drawer graph behind a dynamic import', () => {
    for (const modulePath of [
      '@tuturuuu/ui/accordion',
      '@tuturuuu/ui/sheet',
      './auth-button',
      './shared/navigation-config',
    ] as const) {
      expect(menuSource).not.toMatch(staticImportPattern(modulePath));
    }

    expect(menuSource).toMatch(/import\(["']\.\/mobile-menu["']\)/u);
    expect(mobileMenuSource).toMatch(staticImportPattern('@tuturuuu/ui/sheet'));
    expect(mobileMenuSource).toMatch(
      staticImportPattern('@tuturuuu/ui/accordion')
    );
  });

  it('does not preload the full marketing footer on login routes', () => {
    expect(footerSource).not.toMatch(
      staticImportPattern('@tuturuuu/ui/custom/common-footer')
    );
    expect(footerSource).toMatch(
      /import\(\s*['"]@tuturuuu\/ui\/custom\/common-footer['"]\s*\)/u
    );
    expect(footerSource).toContain("pathname.startsWith('/login')");
  });

  it('does not construct inactive product or solution navigation sections', () => {
    expect(navigationConfigSource).not.toContain('landing.features.apps');
    expect(navigationConfigSource).not.toContain(
      'getTuturuuuPortlessAppOrigin'
    );
    expect(navigationConfigSource).not.toContain("{ title: 'products'");
    expect(navigationConfigSource).not.toContain("{ title: 'solutions'");
  });

  it('keeps shell dropdown icons on the static lucide subpath', () => {
    for (const sourceText of [
      dropdownMenuSource,
      userNavClientSource,
      reportProblemMenuItemSource,
    ] as const) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).not.toMatch(
        staticImportPattern('@tuturuuu/icons/lucide')
      );
      expect(sourceText).toContain('@tuturuuu/icons/lucide-static');
    }
  });

  it('keeps common UI primitive icons on the static lucide subpath', () => {
    for (const sourceText of commonPrimitiveSources) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).not.toMatch(
        staticImportPattern('@tuturuuu/icons/lucide')
      );
      expect(sourceText).toContain('@tuturuuu/icons/lucide-static');
    }
  });

  it('keeps public marketing page icons on the static lucide subpath', () => {
    expect(aboutPageSource).not.toMatch(staticImportPattern('@tuturuuu/icons'));
    expect(aboutPageSource).not.toMatch(
      staticImportPattern('@tuturuuu/icons/lucide')
    );
    expect(aboutPageSource).toContain('@tuturuuu/icons/lucide-static');
  });

  it('keeps legal page icons off the package root export', () => {
    for (const sourceText of legalIconBoundarySources) {
      expect(sourceText).not.toContain("from '@tuturuuu/icons'");
      expect(sourceText).not.toContain('from "@tuturuuu/icons"');
      expect(sourceText).toContain('@tuturuuu/icons/lucide');
    }
  });

  it('keeps product page icons off the package root export', () => {
    for (const sourceText of productPageIconBoundarySources) {
      expect(sourceText).not.toContain("from '@tuturuuu/icons'");
      expect(sourceText).not.toContain('from "@tuturuuu/icons"');
      expect(sourceText).toContain('@tuturuuu/icons/lucide');
    }
  });

  it('keeps the login route off framer-motion', () => {
    for (const sourceText of [
      loginContentSource,
      loginFormSource,
      loginConfirmationPartsSource,
    ] as const) {
      expect(sourceText).not.toContain('framer-motion');
    }
  });

  it('loads the internal-app confirmation UI only after login needs it', () => {
    expect(loginFormSource).not.toMatch(
      staticImportPattern('./internal-app-account-confirmation')
    );
    expect(loginFormSource).toMatch(
      /import\(\s*['"]\.\/internal-app-account-confirmation['"]\s*\)/u
    );
  });

  it('loads login server auth only when cookies can contain a session', () => {
    for (const modulePath of [
      '@tuturuuu/supabase/next/auth-session-user',
      '@tuturuuu/supabase/next/server',
    ] as const) {
      expect(loginPageSource).not.toMatch(staticImportPattern(modulePath));
      expect(loginPageSource).toContain(`import('${modulePath}')`);
    }

    expect(loginPageSource).toContain("headerStore.get('cookie')");
  });

  it('loads OTP input UI only after login needs it', () => {
    expect(loginFormSource).not.toMatch(
      staticImportPattern('@tuturuuu/ui/input-otp')
    );
    expect(loginFormSource).toMatch(
      /import\(\s*['"]@tuturuuu\/ui\/input-otp['"]\s*\)/u
    );
  });

  it('keeps the login Turnstile widget behind a dynamic import', () => {
    expect(loginFormSource).not.toMatch(
      staticImportPattern('@marsidev/react-turnstile')
    );
    expect(loginFormSource).toMatch(
      /import\(\s*['"]@marsidev\/react-turnstile['"]\s*\)/u
    );
  });

  it('loads the report-problem dialog only after the menu action opens it', () => {
    expect(reportProblemMenuItemSource).not.toMatch(
      staticImportPattern('@tuturuuu/ui/report-problem-dialog')
    );
    expect(reportProblemMenuItemSource).toMatch(
      /import\(\s*['"]@tuturuuu\/ui\/report-problem-dialog['"]\s*\)/u
    );
    expect(reportProblemMenuItemSource).toContain('{open && (');
  });

  it('keeps Mantine styles scoped to the time tracker layout', () => {
    for (const modulePath of [
      '@mantine/charts/styles.layer.css',
      '@mantine/core/styles.layer.css',
    ] as const) {
      expect(rootLayoutSource).not.toContain(modulePath);
      expect(timeTrackerLayoutSource).toContain(modulePath);
    }
  });
});
