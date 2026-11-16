import { parse } from '@babel/parser';

export function staticImportModules(source: string): string[] {
  const file = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  return file.program.body.flatMap((statement) => {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.importKind === 'type'
    )
      return [];
    if (
      statement.specifiers.length > 0 &&
      statement.specifiers.every(
        (specifier) =>
          specifier.type === 'ImportSpecifier' &&
          specifier.importKind === 'type'
      )
    )
      return [];
    return [statement.source.value];
  });
}
