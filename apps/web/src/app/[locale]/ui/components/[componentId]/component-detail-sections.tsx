import { Badge } from '@tuturuuu/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import type { ComponentDoc } from '../../component-docs';
import { componentDocs } from '../../component-docs';
import { LinkGrid, LinkPanel } from '../../docs-primitives';

type Translator = (
  key: string,
  values?: Record<string, string | number>
) => string;

export function ApiReferenceTable({
  doc,
  t,
}: {
  doc: ComponentDoc;
  t: Translator;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('detail.api.name')}</TableHead>
          <TableHead>{t('detail.api.kind')}</TableHead>
          <TableHead>{t('detail.api.description')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {doc.apiReference.rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell>
              <code>{row.name}</code>
            </TableCell>
            <TableCell>{t(`detail.api.kinds.${row.kind}`)}</TableCell>
            <TableCell className="text-muted-foreground">
              {t('detail.api.exportDescription', {
                importPath: doc.importPath,
                name: row.name,
              })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CustomizationBadges({
  doc,
  tCustomizations,
}: {
  doc: ComponentDoc;
  tCustomizations: Translator;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {doc.customizationKeys.map((key) => (
        <Badge key={key} variant="outline">
          {tCustomizations(key)}
        </Badge>
      ))}
    </div>
  );
}

export function RelatedComponents({
  baseHref,
  doc,
  t,
  tCategories,
}: {
  baseHref: string;
  doc: ComponentDoc;
  t: Translator;
  tCategories: Translator;
}) {
  return (
    <LinkGrid>
      {doc.related.map((relatedId) => {
        const related = componentDocs.find(
          (candidate) => candidate.id === relatedId
        );
        if (!related) return null;
        return (
          <LinkPanel
            accent={related.category}
            description={t('detail.relatedItemDescription', {
              category: tCategories(related.category),
              importPath: related.importPath,
            })}
            href={`${baseHref}/${related.slug}`}
            key={related.id}
            meta={related.importPath}
            title={related.name}
          />
        );
      })}
    </LinkGrid>
  );
}
