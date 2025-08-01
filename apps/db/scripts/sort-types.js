#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function sortTypeLiteral(node, sourceFile) {
  if (!ts.isTypeLiteralNode(node)) {
    return;
  }

  const properties = [...node.members];
  if (properties.length > 1) {
    properties.sort((a, b) => {
      const nameA = a.name ? a.name.getText(sourceFile) : '';
      const nameB = b.name ? b.name.getText(sourceFile) : '';
      return nameA.localeCompare(nameB);
    });

    const sortedMembers = ts.factory.createNodeArray(properties);
    return ts.factory.updateTypeLiteralNode(node, sortedMembers);
  }
  return node;
}

function main() {
  try {
    const typesFilePath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'packages',
      'types',
      'src',
      'supabase.ts'
    );

    console.log('🔍 Reading types file:', typesFilePath);

    if (!fs.existsSync(typesFilePath)) {
      console.error('❌ Error: Types file not found at', typesFilePath);
      process.exit(1);
    }

    const content = fs.readFileSync(typesFilePath, 'utf8');
    console.log('📖 Read', content.length, 'characters');

    const sourceFile = ts.createSourceFile(
      'supabase.ts',
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const transformer = (context) => (rootNode) => {
      function visit(node) {
        node = ts.visitEachChild(node, visit, context);
        if (ts.isTypeLiteralNode(node)) {
          return sortTypeLiteral(node, sourceFile);
        }
        return node;
      }
      return ts.visitNode(rootNode, visit);
    };

    const result = ts.transform(sourceFile, [transformer]);
    const transformedSourceFile = result.transformed[0];

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const sortedContent = printer.printFile(transformedSourceFile);

    console.log('🔄 Sorted object keys');

    fs.writeFileSync(typesFilePath, sortedContent, 'utf8');
    console.log('💾 Wrote sorted content back to file');

    console.log('✅ Successfully sorted object keys in types file');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}