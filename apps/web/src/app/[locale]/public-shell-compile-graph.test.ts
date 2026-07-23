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
const navigationMenuSource = source('src/app/[locale]/navigation-menu.tsx');
const marketingNavShellSource = source(
  'src/app/[locale]/marketing-nav/marketing-nav-shell.tsx'
);
const marketingNavDropdownSource = source(
  'src/app/[locale]/marketing-nav/nav-dropdown.tsx'
);
const userNavClientSource = source('src/app/[locale]/user-nav-client.tsx');
const reportProblemMenuItemSource = source(
  'src/app/[locale]/report-problem-menu-item.tsx'
);
const loginContentSource = source(
  'src/app/[locale]/(auth)/login/login-content.tsx'
);
const loginFormSource = source('src/app/[locale]/(auth)/login/form.tsx');
const loginPageSource = source('src/app/[locale]/(auth)/login/page.tsx');
const logoutPageSource = source('src/app/[locale]/(marketing)/logout/page.tsx');
const loginConfirmationPartsSource = source(
  'src/app/[locale]/(auth)/login/internal-app-account-confirmation-parts.tsx'
);
const landingHeroSource = source(
  'src/components/landing/hero/hero-section.tsx'
);
const landingVideoHeroSource = source(
  'src/components/landing/hero/video-hero.tsx'
);
const aboutPageSource = source('src/app/[locale]/(marketing)/about/page.tsx');
const securityPageSource = source(
  'src/app/[locale]/(marketing)/security/page.tsx'
);
const securityPolicyPageSource = source(
  'src/app/[locale]/(marketing)/security/policy/page.tsx'
);
const securityPolicyComponentsSource = source(
  'src/app/[locale]/(marketing)/security/policy/policy-components.tsx'
);
const legalKitSources = [
  'src/components/legal/legal-page-layout.tsx',
  'src/components/legal/legal-section-card.tsx',
  'src/components/legal/legal-summary-card.tsx',
  'src/components/legal/table-of-contents.tsx',
].map(source);
const securityBugBountyPageSource = source(
  'src/app/[locale]/(marketing)/security/bug-bounty/page.tsx'
);
const securityBugBountyComponentsSource = source(
  'src/app/[locale]/(marketing)/security/bug-bounty/bug-bounty-components.tsx'
);
const partnersPageSource = source(
  'src/app/[locale]/(marketing)/partners/page.tsx'
);
const blogPageSource = source('src/app/[locale]/(marketing)/blog/page.tsx');
const contactPageSource = source(
  'src/app/[locale]/(marketing)/contact/page.tsx'
);
const careersPageSource = source(
  'src/app/[locale]/(marketing)/careers/page.tsx'
);
const womenInTechPageSource = source(
  'src/app/[locale]/(marketing)/women-in-tech/page.tsx'
);
const accountDeletePageSource = source(
  'src/app/[locale]/(marketing)/account/delete/page.tsx'
);
const brandingClientSource = source(
  'src/app/[locale]/(marketing)/branding/branding-client.tsx'
);
const modelsClientSource = source(
  'src/app/[locale]/(marketing)/models/models-client.tsx'
);
const contributorsPageSource = source(
  'src/app/[locale]/(marketing)/contributors/page.tsx'
);
// These four pages were rebuilt from single client files into server sections,
// so the import boundaries they are pinned to now live in their component
// modules. Each group is asserted as a whole, the same way `contact` is.
const securityComponentSources = [
  'src/app/[locale]/(marketing)/security/components/defence-grid.tsx',
  'src/app/[locale]/(marketing)/security/components/defence-rings.tsx',
  'src/app/[locale]/(marketing)/security/components/disclosure-section.tsx',
  'src/app/[locale]/(marketing)/security/components/security-hero.tsx',
  'src/app/[locale]/(marketing)/security/components/trust-section.tsx',
].map(source);
const partnersComponentSources = [
  'src/app/[locale]/(marketing)/partners/components/partner-card.tsx',
  'src/app/[locale]/(marketing)/partners/components/partners-sections.tsx',
].map(source);
const careersComponentSources = [
  'src/app/[locale]/(marketing)/careers/components/careers-sections.tsx',
  'src/app/[locale]/(marketing)/careers/components/role-card.tsx',
].map(source);
const blogComponentSources = [
  'src/app/[locale]/(marketing)/blog/components/blog-sections.tsx',
].map(source);
const contributorsComponentSources = [
  'src/app/[locale]/(marketing)/contributors/components/analytics-section.tsx',
  'src/app/[locale]/(marketing)/contributors/components/contributor-grid.tsx',
  'src/app/[locale]/(marketing)/contributors/components/contributors-hero.tsx',
].map(source);
const marketingKitSources = [
  'src/components/marketing/action-link.tsx',
  'src/components/marketing/page-hero.tsx',
  'src/components/marketing/stat-strip.tsx',
].map(source);
const aboutComponentSources = [
  'src/app/[locale]/(marketing)/about/components/beliefs-section.tsx',
  'src/app/[locale]/(marketing)/about/components/capabilities-section.tsx',
  'src/app/[locale]/(marketing)/about/components/closing-section.tsx',
  'src/app/[locale]/(marketing)/about/components/community-section.tsx',
  'src/app/[locale]/(marketing)/about/components/company-section.tsx',
  'src/app/[locale]/(marketing)/about/components/costs-section.tsx',
  'src/app/[locale]/(marketing)/about/components/ecosystem-section.tsx',
  'src/app/[locale]/(marketing)/about/components/hero-section.tsx',
  'src/app/[locale]/(marketing)/about/components/journey-section.tsx',
  'src/app/[locale]/(marketing)/about/components/purpose-section.tsx',
  'src/app/[locale]/(marketing)/about/components/stack-section.tsx',
].map(source);
const contactComponentSources = [
  'src/app/[locale]/(marketing)/contact/contact-aside.tsx',
  'src/app/[locale]/(marketing)/contact/contact-channels.tsx',
  'src/app/[locale]/(marketing)/contact/contact-closing.tsx',
  'src/app/[locale]/(marketing)/contact/contact-exchange.tsx',
  'src/app/[locale]/(marketing)/contact/contact-form.tsx',
  'src/app/[locale]/(marketing)/contact/contact-hero.tsx',
].map(source);
const contributorsAnalyticsSource = source(
  'src/app/[locale]/(marketing)/contributors/contribution-analytics.tsx'
);
const horseRacingVisualizationSource = source(
  'src/components/visualizations/horse-racing/visualization.tsx'
);
const horseRacingIconBoundarySources = [
  horseRacingVisualizationSource,
  source('src/components/visualizations/horse-racing/algorithm-benchmarks.tsx'),
  source(
    'src/components/visualizations/horse-racing/algorithm-diagnostics.tsx'
  ),
  source('src/components/visualizations/horse-racing/algorithm-insights.tsx'),
  source('src/components/visualizations/horse-racing/benchmark-runner.tsx'),
  source('src/components/visualizations/horse-racing/configuration-panel.tsx'),
  source('src/components/visualizations/horse-racing/explaination.tsx'),
  source('src/components/visualizations/horse-racing/race-controls.tsx'),
  source('src/components/visualizations/horse-racing/race-details.tsx'),
  source('src/components/visualizations/horse-racing/race-insights.tsx'),
] as const;
const facebookMockupIconBoundarySources = [
  source(
    '../../packages/ui/src/components/ui/custom/facebook-mockup/facebook-mockup.tsx'
  ),
  source('../../packages/ui/src/components/ui/custom/facebook-mockup/form.tsx'),
  source(
    '../../packages/ui/src/components/ui/custom/facebook-mockup/image-upload-field.tsx'
  ),
  source(
    '../../packages/ui/src/components/ui/custom/facebook-mockup/preview.tsx'
  ),
] as const;
const meetCreatePlanDialogSource = source(
  '../../packages/ui/src/components/ui/legacy/meet/create-plan-dialog.tsx'
);
const educationSolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/education/page.tsx'
);
const healthcareSolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/healthcare/page.tsx'
);
const retailSolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/retail/page.tsx'
);
const restaurantsSolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/restaurants/page.tsx'
);
const hospitalitySolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/hospitality/page.tsx'
);
const constructionSolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/construction/page.tsx'
);
const manufacturingSolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/manufacturing/page.tsx'
);
const pharmaciesSolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/pharmacies/page.tsx'
);
const realEstateSolutionPageSource = source(
  'src/app/[locale]/(marketing)/solutions/realestate/page.tsx'
);
const uiDocsOverviewIconBoundarySources = [
  source('src/app/[locale]/ui/page.tsx'),
  source('src/app/[locale]/ui/docs-primitives.tsx'),
  source('src/app/[locale]/ui/copy-button.tsx'),
  source('src/app/[locale]/ui/ui-docs-sidebar.tsx'),
  source('src/app/[locale]/ui/ui-docs-mobile-nav.tsx'),
] as const;
const uiDocsComponentsIconBoundarySources = [
  source('src/app/[locale]/ui/component-index-card.tsx'),
  source('src/app/[locale]/ui/docs-navigation.tsx'),
  source('src/app/[locale]/ui/ui-docs-command-trigger.tsx'),
] as const;
const uiDocsComponentPreviewSource = source(
  'src/app/[locale]/ui/component-preview.tsx'
);
const uiDocsShikiSource = source('src/app/[locale]/ui/shiki.ts');
const rootLayoutSource = source('src/app/[locale]/layout.tsx');
const legalSectionCardSource = source(
  'src/components/legal/legal-section-card.tsx'
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
  legalSectionCardSource,
  source('src/components/legal/legal-summary-card.tsx'),
  source('src/components/legal/legal-types.ts'),
  source('src/components/legal/table-of-contents.tsx'),
  source('src/components/legal/third-party-services-section.tsx'),
  source('src/data/legal/acceptable-use-sections.tsx'),
  source('src/data/legal/community-guidelines-sections.tsx'),
  source('src/data/legal/privacy-sections.tsx'),
  source('src/data/legal/terms-sections.tsx'),
] as const;
const thirdPartyProvidersSource = source(
  'src/data/legal/third-party-providers.ts'
);
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
const productPagePrimitivesSource = source(
  'src/app/[locale]/(marketing)/products/product-page-primitives.tsx'
);
const legalSharedUiBoundarySources = [
  source('src/app/[locale]/(marketing)/privacy/page.tsx'),
  source('src/components/legal/animate-in-view.tsx'),
  source('src/components/legal/legal-page-layout.tsx'),
  legalSectionCardSource,
  source('src/components/legal/legal-summary-card.tsx'),
  source('src/components/legal/table-of-contents.tsx'),
  source('src/components/legal/third-party-services-section.tsx'),
  source('src/data/legal/privacy-summary.tsx'),
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
  it('keeps desktop marketing dropdowns visible outside the navbar pill', () => {
    expect(marketingNavShellSource).toContain('overflow-visible');
    expect(marketingNavShellSource).not.toContain('overflow-hidden');
    expect(marketingNavDropdownSource).not.toContain('rotate-180');
  });

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

  it('keeps desktop public navigation off shared navigation primitives', () => {
    for (const modulePath of [
      '@tuturuuu/ui/badge',
      '@tuturuuu/ui/card',
      '@tuturuuu/ui/navigation-menu',
      'next/link',
    ] as const) {
      expect(navigationMenuSource).not.toMatch(staticImportPattern(modulePath));
    }
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
    for (const sourceText of [aboutPageSource, ...aboutComponentSources]) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).not.toMatch(
        staticImportPattern('@tuturuuu/icons/lucide')
      );
    }

    expect(aboutComponentSources.join('\n')).toContain(
      '@tuturuuu/icons/lucide-static'
    );
  });

  it('keeps the about page off next link', () => {
    expect(aboutPageSource).not.toMatch(staticImportPattern('next/link'));
  });

  it('keeps the public security page off the icon package root', () => {
    for (const sourceText of [
      securityPageSource,
      ...securityComponentSources,
    ]) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
    }

    expect(securityComponentSources.join('\n')).toContain(
      '@tuturuuu/icons/lucide'
    );
  });

  it('keeps public security subpages off the icon package root', () => {
    for (const sourceText of [
      securityPolicyPageSource,
      securityPolicyComponentsSource,
      securityBugBountyPageSource,
      securityBugBountyComponentsSource,
    ] as const) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).toContain('@tuturuuu/icons/lucide');
    }
  });

  it('keeps public security subpages off Next link', () => {
    for (const sourceText of [
      securityPolicyPageSource,
      securityBugBountyPageSource,
    ] as const) {
      expect(sourceText).not.toMatch(staticImportPattern('next/link'));
    }
  });

  it('keeps public security subpages off shared UI primitives', () => {
    // They used to satisfy this by routing through a local
    // `security-subpage-primitives` module that re-declared Badge/Card/Button.
    // Those subpages now use the shared marketing kit, so that module is gone
    // and the ban is asserted directly.
    for (const sourceText of [
      securityPolicyPageSource,
      securityPolicyComponentsSource,
      securityBugBountyPageSource,
      securityBugBountyComponentsSource,
    ] as const) {
      for (const modulePath of [
        '@tuturuuu/ui/badge',
        '@tuturuuu/ui/button',
        '@tuturuuu/ui/card',
      ] as const) {
        expect(sourceText).not.toMatch(staticImportPattern(modulePath));
      }
    }
  });

  it('keeps the legal kit off heavy primitives and dead colour classes', () => {
    for (const sourceText of legalKitSources) {
      for (const modulePath of [
        '@tuturuuu/icons',
        '@tuturuuu/ui/badge',
        '@tuturuuu/ui/button',
        '@tuturuuu/ui/card',
        'next/link',
      ] as const) {
        expect(sourceText).not.toMatch(staticImportPattern(modulePath));
      }

      // Every legal section card used to build `bg-dynamic-${color}` at
      // render time, which Tailwind never emits, so no legal page had accents.
      expect(sourceText).not.toMatch(/dynamic-\$\{/u);
    }
  });

  it('keeps the public security page off shared UI primitives', () => {
    for (const sourceText of [
      securityPageSource,
      ...securityComponentSources,
    ]) {
      for (const modulePath of [
        '@tuturuuu/ui/badge',
        '@tuturuuu/ui/button',
        '@tuturuuu/ui/card',
        'next/link',
      ] as const) {
        expect(sourceText).not.toMatch(staticImportPattern(modulePath));
      }
    }
  });

  it('keeps the public partners page off heavy shared primitives', () => {
    for (const sourceText of [
      partnersPageSource,
      ...partnersComponentSources,
    ]) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));

      for (const modulePath of [
        '@tuturuuu/ui/button',
        '@tuturuuu/ui/card',
        'next/image',
        'next/link',
      ] as const) {
        expect(sourceText).not.toMatch(staticImportPattern(modulePath));
      }
    }

    expect(partnersComponentSources.join('\n')).toContain(
      '@tuturuuu/icons/lucide'
    );
  });

  it('keeps the public careers page off the icon package root', () => {
    for (const sourceText of [careersPageSource, ...careersComponentSources]) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).not.toMatch(staticImportPattern('next/link'));
    }

    expect(careersComponentSources.join('\n')).toContain(
      '@tuturuuu/icons/lucide'
    );
  });

  it('keeps the public blog page off Next link', () => {
    for (const sourceText of [blogPageSource, ...blogComponentSources]) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).not.toMatch(staticImportPattern('next/link'));
    }

    expect(blogComponentSources.join('\n')).toContain('@tuturuuu/icons/lucide');
  });

  it('keeps the shared marketing kit off heavy primitives', () => {
    for (const sourceText of marketingKitSources) {
      for (const modulePath of [
        '@tuturuuu/icons',
        '@tuturuuu/ui/badge',
        '@tuturuuu/ui/button',
        '@tuturuuu/ui/card',
        'next/image',
        'next/link',
        'framer-motion',
      ] as const) {
        expect(sourceText).not.toMatch(staticImportPattern(modulePath));
      }
    }
  });

  it('keeps the public contact page off the icon package root', () => {
    for (const sourceText of [contactPageSource, ...contactComponentSources]) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
    }

    expect(contactComponentSources.join('\n')).toContain(
      '@tuturuuu/icons/lucide'
    );
  });

  it('keeps the public women-in-tech page off the icon package root', () => {
    expect(womenInTechPageSource).not.toMatch(
      staticImportPattern('@tuturuuu/icons')
    );
    expect(womenInTechPageSource).toContain('@tuturuuu/icons/lucide');
  });

  it('keeps the public women-in-tech page off heavy shared UI primitives', () => {
    for (const modulePath of [
      '@tuturuuu/ui/badge',
      '@tuturuuu/ui/card',
    ] as const) {
      expect(womenInTechPageSource).not.toMatch(
        staticImportPattern(modulePath)
      );
    }

    expect(womenInTechPageSource).toMatch(
      staticImportPattern('@tuturuuu/ui/button')
    );
  });

  it('keeps the UI docs overview shell off the icon package root', () => {
    for (const sourceText of uiDocsOverviewIconBoundarySources) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).not.toMatch(
        staticImportPattern('@tuturuuu/icons/lucide')
      );
      expect(sourceText).toContain('@tuturuuu/icons/lucide-static');
    }
  });

  it('keeps the UI docs components index off the icon package root', () => {
    for (const sourceText of uiDocsComponentsIconBoundarySources) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).not.toMatch(
        staticImportPattern('@tuturuuu/icons/lucide')
      );
      expect(sourceText).toContain('@tuturuuu/icons/lucide-static');
    }
  });

  it('keeps UI docs live previews out of the server-rendered detail route', () => {
    expect(uiDocsComponentPreviewSource).toContain(
      "dynamic(() => import('./preview-render')"
    );
    expect(uiDocsComponentPreviewSource).toContain('ssr: false');
  });

  it('keeps UI docs dev code blocks off the static Shiki import graph', () => {
    expect(uiDocsShikiSource).not.toContain('import { createHighlighter');
    expect(uiDocsShikiSource).toContain(
      "import type { Highlighter } from 'shiki';"
    );
    expect(uiDocsShikiSource).toContain("import('shiki')");
    expect(uiDocsShikiSource).toContain("NODE_ENV === 'development'");
  });

  it('keeps the account deletion page off the icon package root', () => {
    expect(accountDeletePageSource).not.toMatch(
      staticImportPattern('@tuturuuu/icons')
    );
    expect(accountDeletePageSource).toContain('@tuturuuu/icons/lucide');
  });

  it('keeps the account deletion page off heavy shared UI primitives', () => {
    for (const modulePath of [
      '@tuturuuu/ui/badge',
      '@tuturuuu/ui/card',
      '@tuturuuu/ui/separator',
    ] as const) {
      expect(accountDeletePageSource).not.toMatch(
        staticImportPattern(modulePath)
      );
    }

    expect(accountDeletePageSource).toMatch(
      staticImportPattern('@tuturuuu/ui/button')
    );
  });

  it('keeps the branding page off the icon package root', () => {
    expect(brandingClientSource).not.toMatch(
      staticImportPattern('@tuturuuu/icons')
    );
    expect(brandingClientSource).not.toMatch(staticImportPattern('next/image'));
    expect(brandingClientSource).toContain('@tuturuuu/icons/lucide');
  });

  it('keeps the models page off the icon package root', () => {
    expect(modelsClientSource).not.toMatch(
      staticImportPattern('@tuturuuu/icons')
    );
    expect(modelsClientSource).toContain('@tuturuuu/icons/lucide');
  });

  it('keeps contributors charts out of the initial route graph', () => {
    for (const sourceText of [
      contributorsPageSource,
      ...contributorsComponentSources,
    ]) {
      expect(sourceText).not.toMatch(staticImportPattern('recharts'));
    }

    // The dynamic boundary moved into the section that renders the charts.
    expect(contributorsComponentSources.join('\n')).toContain(
      "import('../contribution-analytics')"
    );
    expect(contributorsAnalyticsSource).toMatch(
      staticImportPattern('recharts')
    );
  });

  it('keeps the contributors page off Next link and image', () => {
    for (const sourceText of [
      contributorsPageSource,
      ...contributorsComponentSources,
    ]) {
      expect(sourceText).not.toMatch(staticImportPattern('next/link'));
      expect(sourceText).not.toMatch(staticImportPattern('next/image'));
    }
  });

  it('keeps the contributors charts free of fabricated data', () => {
    // Two of the three charts here were generated with `Math.random()` and
    // captioned as repository analytics. Nothing on this page may invent a
    // number again.
    // Comments are stripped first: the module's own header explains what was
    // removed, and naming the thing is not using it.
    const withoutComments = contributorsAnalyticsSource
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/\/\/.*$/gmu, '');

    expect(withoutComments).not.toContain('Math.random');
  });

  it('keeps the Facebook mockup widget off the icon package root', () => {
    for (const sourceText of facebookMockupIconBoundarySources) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).toContain('@tuturuuu/icons/lucide');
    }
  });

  it('keeps the meet rich text editor out of the initial route graph', () => {
    expect(meetCreatePlanDialogSource).not.toMatch(
      staticImportPattern('@tuturuuu/ui/text-editor/editor')
    );
    expect(meetCreatePlanDialogSource).toMatch(
      /import\(\s*['"]@tuturuuu\/ui\/text-editor\/editor['"]\s*\)/u
    );
  });

  it('keeps horse-racing analytics panels out of the initial route graph', () => {
    for (const modulePath of [
      './algorithm-analytics',
      './algorithm-benchmarks',
      './algorithm-diagnostics',
      './algorithm-insights',
      './benchmark-runner',
    ] as const) {
      expect(horseRacingVisualizationSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(horseRacingVisualizationSource).toContain(
        `import('${modulePath}')`
      );
    }
  });

  it('keeps horse-racing icons off the icon package root', () => {
    for (const sourceText of horseRacingIconBoundarySources) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).toContain('@tuturuuu/icons/lucide');
    }
  });

  it('keeps migrated solution pages off heavy public primitives', () => {
    for (const sourceText of [
      educationSolutionPageSource,
      healthcareSolutionPageSource,
      retailSolutionPageSource,
      restaurantsSolutionPageSource,
      hospitalitySolutionPageSource,
      constructionSolutionPageSource,
      manufacturingSolutionPageSource,
      pharmaciesSolutionPageSource,
      realEstateSolutionPageSource,
    ] as const) {
      expect(sourceText).not.toMatch(staticImportPattern('@tuturuuu/icons'));
      expect(sourceText).toContain('@tuturuuu/icons/lucide');

      for (const modulePath of [
        '@tuturuuu/ui/badge',
        '@tuturuuu/ui/button',
        '@tuturuuu/ui/card',
        '@tuturuuu/ui/custom/gradient-headline',
        'next/link',
      ] as const) {
        expect(sourceText).not.toMatch(staticImportPattern(modulePath));
      }
    }
  });

  it('keeps legal page icons off the package root export', () => {
    for (const sourceText of legalIconBoundarySources) {
      expect(sourceText).not.toContain("from '@tuturuuu/icons'");
      expect(sourceText).not.toContain('from "@tuturuuu/icons"');
      expect(sourceText).toContain('@tuturuuu/icons/lucide');
    }
  });

  it('keeps third-party legal provider data icon-free', () => {
    expect(thirdPartyProvidersSource).not.toContain('@tuturuuu/icons');
  });

  it('keeps legal policy pages off the shared markdown renderer', () => {
    expect(legalSectionCardSource).not.toMatch(
      staticImportPattern('@tuturuuu/ui/markdown')
    );
  });

  it('keeps static legal pages off shared UI client primitives', () => {
    for (const sourceText of legalSharedUiBoundarySources) {
      expect(sourceText).not.toMatch(
        /^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+['"]@tuturuuu\/ui(?:\/[^'"]+)?['"];/mu
      );
      expect(sourceText).not.toContain("'use client'");
      expect(sourceText).not.toContain('"use client"');
    }
  });

  it('keeps product page icons off the package root export', () => {
    for (const sourceText of productPageIconBoundarySources) {
      expect(sourceText).not.toContain("from '@tuturuuu/icons'");
      expect(sourceText).not.toContain('from "@tuturuuu/icons"');
      expect(sourceText).toContain('@tuturuuu/icons/lucide');
    }
  });

  it('keeps static product pages off shared UI primitive imports', () => {
    for (const sourceText of productPageIconBoundarySources) {
      for (const modulePath of [
        '@tuturuuu/ui/badge',
        '@tuturuuu/ui/button',
        '@tuturuuu/ui/card',
      ] as const) {
        expect(sourceText).not.toMatch(staticImportPattern(modulePath));
      }

      expect(sourceText).toContain('../product-page-primitives');
    }

    expect(productPagePrimitivesSource).not.toMatch(
      staticImportPattern('next/link')
    );
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

  it('keeps the login page static and free of server auth', () => {
    for (const modulePath of [
      '@tuturuuu/supabase/next/auth-session-user',
      '@tuturuuu/supabase/next/server',
      'next/headers',
      'next/navigation',
    ] as const) {
      expect(loginPageSource).not.toMatch(staticImportPattern(modulePath));
      expect(loginPageSource).not.toContain(`import('${modulePath}')`);
    }

    expect(loginPageSource).not.toMatch(staticImportPattern('next/server'));
    expect(loginPageSource).not.toContain('await connection()');
    expect(loginPageSource).not.toContain('searchParams');
    expect(loginPageSource).not.toContain('export const dynamic');
    expect(loginPageSource).not.toContain('export const revalidate');
  });

  it('lazy loads the heavy login form from the static shell', () => {
    expect(loginContentSource).not.toMatch(staticImportPattern('./form'));
    expect(loginContentSource).toContain("lazy(() => import('./form'))");
  });

  it('keeps the login shell off Next link and image primitives', () => {
    expect(loginContentSource).not.toMatch(staticImportPattern('next/link'));
    expect(loginContentSource).not.toMatch(staticImportPattern('next/image'));
    expect(loginFormSource).not.toMatch(staticImportPattern('next/image'));
  });

  it('keeps the logout page off the icon package root', () => {
    expect(logoutPageSource).not.toMatch(
      staticImportPattern('@tuturuuu/icons')
    );
    expect(logoutPageSource).toContain('@tuturuuu/icons/lucide');
  });

  it('keeps the landing hero off shared UI and Next primitives', () => {
    for (const modulePath of [
      '@tuturuuu/ui/badge',
      '@tuturuuu/ui/button',
      'next/link',
    ] as const) {
      expect(landingHeroSource).not.toMatch(staticImportPattern(modulePath));
    }

    expect(landingVideoHeroSource).not.toMatch(
      staticImportPattern('next/image')
    );
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

  it('keeps Mantine styles out of the public root layout', () => {
    for (const modulePath of [
      '@mantine/charts/styles.layer.css',
      '@mantine/core/styles.layer.css',
    ] as const) {
      expect(rootLayoutSource).not.toContain(modulePath);
    }
  });
});
