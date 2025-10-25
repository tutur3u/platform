#!/usr/bin/env node

/**
 * Manages memorable names for Supabase projects
 * Helps prevent accidental operations on wrong projects
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_REF_PATH = resolve(__dirname, '../supabase/.temp/project-ref');
const NAMES_MAP_PATH = resolve(
  __dirname,
  '../supabase/.temp/project-names.json'
);

function readProjectRef() {
  try {
    const content = readFileSync(PROJECT_REF_PATH, 'utf-8');
    return content.trim();
  } catch (error) {
    console.error('\n❌ Error: Could not read project-ref file');
    console.error(`   ${error.message}\n`);
    process.exit(1);
  }
}

function loadNamesMap() {
  try {
    if (existsSync(NAMES_MAP_PATH)) {
      const content = readFileSync(NAMES_MAP_PATH, 'utf-8');
      return JSON.parse(content);
    }
    return {};
  } catch {
    console.warn(
      '⚠️  Warning: Could not load project names map, starting fresh'
    );
    return {};
  }
}

function saveNamesMap(map) {
  try {
    const dir = dirname(NAMES_MAP_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(NAMES_MAP_PATH, JSON.stringify(map, null, 2), 'utf-8');
  } catch (error) {
    console.error('\n❌ Error: Could not save project names map');
    console.error(`   ${error.message}\n`);
  }
}

function promptForName(projectId, existingName) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle Ctrl+C during prompt
  rl.on('SIGINT', () => {
    rl.close();
    console.log('\n\n⚠️  Skipping memorable name setup.\n');
    process.exit(0);
  });

  return new Promise((resolve) => {
    console.log('\n🔐 Security: Set a Memorable Project Name\n');
    console.log(`   Project ID: \x1b[33m${projectId}\x1b[0m`);
    if (existingName) {
      console.log(`   Current Name: \x1b[36m${existingName}\x1b[0m`);
    }
    console.log(
      "   This helps you verify you're operating on the correct project.\n"
    );

    const question = existingName
      ? '   Enter new name (or press Enter to keep current): '
      : '   Enter a memorable name (e.g., "production", "staging", "dev"): ';

    rl.question(question, (answer) => {
      rl.close();
      const name = answer.trim();
      if (name) {
        resolve(name);
      } else if (existingName) {
        resolve(existingName);
      } else {
        resolve(null);
      }
    });
  });
}

async function main() {
  const projectId = readProjectRef();

  if (!projectId) {
    console.error('\n❌ Error: No project linked\n');
    process.exit(1);
  }

  const namesMap = loadNamesMap();
  const existingName = namesMap[projectId];

  // If name already exists, show it and exit
  if (existingName && process.argv[2] !== '--force') {
    console.log('\n✅ Project name already set');
    console.log(`   Project ID: \x1b[33m${projectId}\x1b[0m`);
    console.log(`   Name: \x1b[36m${existingName}\x1b[0m\n`);
    process.exit(0);
  }

  // Prompt for name
  const name = await promptForName(projectId, existingName);

  if (!name) {
    console.log('\n⚠️  No name provided. You can set it later.\n');
    process.exit(0);
  }

  // Save to map
  namesMap[projectId] = name;
  saveNamesMap(namesMap);

  console.log('\n✅ Memorable name saved');
  console.log(`   Project ID: \x1b[33m${projectId}\x1b[0m`);
  console.log(`   Name: \x1b[36m${name}\x1b[0m\n`);
}

main();
