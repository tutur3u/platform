'use client';

import {
  type CmsBlock,
  type CmsField,
  cmsBlockRegistry,
  type TipTapNode,
} from '@tuturuuu/cms-blocks/schema';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';
import type { EditorAction } from './editor-state';

type Doc = { content?: TipTapNode[]; type: 'doc' };

/** Interim plain-paragraph editing for TipTap docs until the packages/editor field lands. */
export function textToDoc(value: string): Doc {
  const paragraphs = value.split(/\n{2,}/).filter((part) => part.trim());
  return {
    content: paragraphs.map((part) => ({
      content: [{ text: part.trim(), type: 'text' }],
      type: 'paragraph',
    })),
    type: 'doc',
  };
}

export function docToText(doc: Doc | undefined): string {
  const textOf = (node: TipTapNode): string =>
    node.text ?? (node.content ?? []).map(textOf).join('');
  return (doc?.content ?? []).map(textOf).join('\n\n');
}

function FieldInput({
  field,
  id,
  onChange,
  value,
}: {
  field: CmsField;
  id: string;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  switch (field.kind) {
    case 'text':
    case 'url':
    case 'image':
      return (
        <Input
          id={id}
          inputMode={field.kind === 'text' ? undefined : 'url'}
          onChange={(event) => onChange(event.target.value)}
          value={String(value ?? '')}
        />
      );
    case 'textarea':
      return (
        <Textarea
          id={id}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          value={String(value ?? '')}
        />
      );
    case 'richtext':
      return (
        <Textarea
          id={id}
          onChange={(event) => onChange(textToDoc(event.target.value))}
          rows={8}
          value={docToText(value as Doc)}
        />
      );
    case 'select':
      return (
        <Select onValueChange={onChange} value={String(value)}>
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    default:
      // Lists and zones are edited on the canvas or in a later inspector iteration.
      return null;
  }
}

export function BlockInspector({
  block,
  dispatch,
}: {
  block: CmsBlock | null;
  dispatch: Dispatch<EditorAction>;
}) {
  const t = useTranslations('external-projects.page_builder');
  if (!block) {
    return (
      <p className="p-4 text-muted-foreground text-sm">
        {t('inspector_empty')}
      </p>
    );
  }
  const fields = Object.entries(
    cmsBlockRegistry[block.type].fields as Record<string, CmsField>
  ).filter(([, field]) => field.kind !== 'list' && field.kind !== 'zone');
  const props = block.props as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="font-semibold text-sm">{t(`blocks.${block.type}`)}</h2>
      {fields.map(([name, field]) => {
        const inputId = `${block.props.id}-${name}`;
        return (
          <div className="flex flex-col gap-1.5" key={inputId}>
            <Label htmlFor={inputId}>{t(`fields.${name}`)}</Label>
            <FieldInput
              field={field}
              id={inputId}
              onChange={(value) =>
                dispatch({
                  id: block.props.id,
                  props: { [name]: value },
                  type: 'update',
                })
              }
              value={props[name]}
            />
          </div>
        );
      })}
    </div>
  );
}
