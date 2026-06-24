import type { TemplateDefinition } from './template-definitions';

export function getInitialFormValues(template: TemplateDefinition) {
  const values: Record<string, unknown> = {};

  for (const field of template.propsSchema) {
    values[field.name] =
      field.defaultValue ?? template.defaultProps[field.name] ?? '';
  }

  return values;
}

export function parseTemplateProps(
  formValues: Record<string, unknown>,
  selectedTemplate: TemplateDefinition | undefined
) {
  if (!selectedTemplate) {
    return {};
  }

  const props: Record<string, unknown> = {};

  for (const field of selectedTemplate.propsSchema) {
    const value = formValues[field.name];

    if (field.type === 'textarea' && typeof value === 'string') {
      try {
        props[field.name] = JSON.parse(value);
      } catch {
        props[field.name] = value;
      }
      continue;
    }

    if (field.type === 'number' && typeof value === 'string') {
      props[field.name] = Number.parseFloat(value) || 0;
      continue;
    }

    props[field.name] = value;
  }

  return props;
}
