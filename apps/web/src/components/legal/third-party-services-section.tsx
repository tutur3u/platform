import { ChevronDown, ExternalLink, ShieldCheck } from '@tuturuuu/icons/lucide';
import type { ThirdPartyCategory } from './legal-types';

interface ThirdPartyServicesSectionProps {
  categories: ThirdPartyCategory[];
  alertTitle?: string;
  alertDescription?: string;
}

export function ThirdPartyServicesSection({
  categories,
  alertTitle = 'Data Sharing Policy',
  alertDescription = 'We carefully select our service providers and share only the minimum data necessary for each service to function. We do NOT sell your personal information to any third party.',
}: ThirdPartyServicesSectionProps) {
  return (
    <div className="space-y-4">
      <div className="relative rounded-lg border bg-background p-4 text-foreground">
        <ShieldCheck className="absolute top-4 left-4 h-4 w-4" />
        <div className="pl-7">
          <h3 className="mb-1 font-medium text-sm leading-none tracking-tight">
            {alertTitle}
          </h3>
          <p className="text-muted-foreground text-sm">{alertDescription}</p>
        </div>
      </div>

      <div className="w-full space-y-2">
        {categories.map((category) => {
          const CategoryIcon = category.icon;
          return (
            <details
              className="group rounded-lg border bg-card px-4 py-3"
              key={category.name}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
                <div className="flex items-center gap-2">
                  <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{category.name}</span>
                  <span className="text-muted-foreground text-xs">
                    ({category.providers.length})
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 pt-3 pl-6">
                {category.providers.map((provider) => (
                  <div
                    key={provider.name}
                    className="flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="font-medium text-sm">{provider.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {provider.purpose}
                      </p>
                    </div>
                    <a
                      href={provider.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-muted-foreground text-xs hover:text-primary"
                    >
                      Policy
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
