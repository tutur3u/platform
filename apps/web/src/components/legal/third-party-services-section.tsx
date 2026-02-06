import { ExternalLink, ShieldCheck } from '@tuturuuu/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
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
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>{alertTitle}</AlertTitle>
        <AlertDescription>{alertDescription}</AlertDescription>
      </Alert>

      <Accordion type="multiple" className="w-full">
        {categories.map((category) => {
          const CategoryIcon = category.icon;
          return (
            <AccordionItem key={category.name} value={category.name}>
              <AccordionTrigger className="text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{category.name}</span>
                  <span className="text-muted-foreground text-xs">
                    ({category.providers.length})
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pl-6">
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
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
