#!/usr/bin/env node

/**
 * Confirmation script for remote database reset
 * Displays the target project ID and prompts for confirmation before proceeding
 */

import { existsSync, readFileSync } from 'node:fs';
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
    console.error(`   Path: ${PROJECT_REF_PATH}`);
    console.error(`   ${error.message}\n`);
    process.exit(1);
  }
}

function getProjectName(projectId) {
  try {
    if (existsSync(NAMES_MAP_PATH)) {
      const content = readFileSync(NAMES_MAP_PATH, 'utf-8');
      const namesMap = JSON.parse(content);
      return namesMap[projectId] || null;
    }
    return null;
  } catch {
    return null;
  }
}

function promptConfirmation(projectId) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle Ctrl+C during prompt
  rl.on('SIGINT', () => {
    rl.close();
    console.log('\n\n❌ Operation cancelled by user (Ctrl+C).\n');
    process.exit(1);
  });

  return new Promise((resolve) => {
    const projectName = getProjectName(projectId);

    console.log('\n⚠️  WARNING: Database Reset Operation\n');
    console.log(`   Target Project ID: \x1b[33m${projectId}\x1b[0m`);
    if (projectName) {
      console.log(`   Project Name: \x1b[36m${projectName}\x1b[0m`);
    }
    console.log('   This will reset the remote database to its seed state.\n');
    console.log('   All data in the remote database will be lost!\n');

    rl.question('   Do you want to continue? (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim() === 'yes');
    });
  });
}

async function main() {
  const projectId = readProjectRef();

  if (!projectId) {
    console.error('\n❌ Error: Project ID is empty\n');
    process.exit(1);
  }

  const confirmed = await promptConfirmation(projectId);

  if (confirmed) {
    console.log('\n✅ Confirmed. Proceeding with reset...\n');
    process.exit(0);
  } else {
    console.log('\n❌ Reset cancelled by user.\n');
    process.exit(1);
  }
}

main();
