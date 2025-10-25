#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sortMembers(node, sourceFile) {
  let members = [];

  if (ts.isTypeLiteralNode(node)) {
    members = [...node.members];
  } else if (ts.isInterfaceDeclaration(node)) {
    members = [...node.members];
  } else if (
    ts.isTypeAliasDeclaration(node) &&
    ts.isTypeLiteralNode(node.type)
  ) {
    members = [...node.type.members];
  } else if (ts.isUnionTypeNode(node)) {
    members = [...node.types];
  } else if (ts.isArrayLiteralExpression(node)) {
    members = [...node.elements];
  }

  if (members.length > 1) {
    members.sort((a, b) => {
      if (ts.isUnionTypeNode(node)) {
        const aText = a.getText(sourceFile);
        const bText = b.getText(sourceFile);
        const aKeys = (aText.match(/:/g) || []).length;
        const bKeys = (bText.match(/:/g) || []).length;
        if (aKeys !== bKeys) {
          return bKeys - aKeys;
        }
      }

      let nameA = '';
      let nameB = '';

      // For properties, enum members, and string literals, use their specific text/name
      if (
        ts.isPropertySignature(a) ||
        ts.isPropertyAssignment(a) ||
        ts.isEnumMember(a)
      ) {
        nameA = a.name ? a.name.getText(sourceFile) : '';
      } else if (ts.isStringLiteral(a) || ts.isNumericLiteral(a)) {
        nameA = a.text;
      } else if (ts.isTypeNode(a)) {
        // For union types, get the text of the type node
        nameA = a.getText(sourceFile);
      } else {
        // Fallback for other nodes
        nameA = a.getText(sourceFile);
      }

      if (
        ts.isPropertySignature(b) ||
        ts.isPropertyAssignment(b) ||
        ts.isEnumMember(b)
      ) {
        nameB = b.name ? b.name.getText(sourceFile) : '';
      } else if (ts.isStringLiteral(b) || ts.isNumericLiteral(b)) {
        nameB = b.text;
      } else if (ts.isTypeNode(b)) {
        // For union types, get the text of the type node
        nameB = b.getText(sourceFile);
      } else {
        // Fallback for other nodes
        nameB = b.getText(sourceFile);
      }
      return nameA.localeCompare(nameB);
    });

    if (ts.isTypeLiteralNode(node)) {
      return ts.factory.updateTypeLiteralNode(
        node,
        ts.factory.createNodeArray(members)
      );
    } else if (ts.isInterfaceDeclaration(node)) {
      return ts.factory.updateInterfaceDeclaration(
        node,
        node.modifiers,
        node.name,
        node.typeParameters,
        node.heritageClauses,
        ts.factory.createNodeArray(members)
      );
    } else if (
      ts.isTypeAliasDeclaration(node) &&
      ts.isTypeLiteralNode(node.type)
    ) {
      return ts.factory.updateTypeAliasDeclaration(
        node,
        node.modifiers,
        node.name,
        node.typeParameters,
        ts.factory.updateTypeLiteralNode(
          node.type,
          ts.factory.createNodeArray(members)
        )
      );
    } else if (ts.isUnionTypeNode(node)) {
      return ts.factory.updateUnionTypeNode(
        node,
        ts.factory.createNodeArray(members)
      );
    } else if (ts.isArrayLiteralExpression(node)) {
      return ts.factory.updateArrayLiteralExpression(
        node,
        ts.factory.createNodeArray(members)
      );
    }
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
        // First, visit all children to ensure nested nodes are sorted first
        node = ts.visitEachChild(node, visit, context);

        // Then, sort the current node if it's a relevant type declaration
        if (
          ts.isTypeLiteralNode(node) ||
          ts.isInterfaceDeclaration(node) ||
          (ts.isTypeAliasDeclaration(node) &&
            ts.isTypeLiteralNode(node.type)) ||
          ts.isUnionTypeNode(node) ||
          ts.isArrayLiteralExpression(node)
        ) {
          return sortMembers(node, sourceFile);
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

    if (content !== sortedContent) {
      fs.writeFileSync(typesFilePath, sortedContent, 'utf8');
      console.log('💾 Wrote sorted content back to file');
    } else {
      console.log('✅ No changes detected, file is already sorted.');
    }

    console.log('✅ Successfully sorted object keys in types file');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
