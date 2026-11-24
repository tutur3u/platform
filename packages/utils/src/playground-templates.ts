import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';

/** One file of starter source, one string per line, ending in a newline. */
const source = (...lines: string[]) => `${lines.join('\n')}\n`;

/**
 * Starter files for each playground language. Every template is idiomatic,
 * formatted the way the language's own formatter writes it, uses only the
 * standard library, and prints exactly `Hello, playground!` with exit 0. The
 * commands are the execution contract and stay as they are.
 */
export const playgroundTemplates: Record<
  PlaygroundLanguage,
  { path: string; content: string; command: string }
> = {
  python: {
    path: 'main.py',
    content: source(
      'def main() -> None:',
      '    print("Hello, playground!")',
      '',
      '',
      'if __name__ == "__main__":',
      '    main()'
    ),
    command: 'python3 main.py',
  },
  javascript: {
    path: 'main.js',
    content: source(
      'function main() {',
      '  console.log("Hello, playground!");',
      '}',
      '',
      'main();'
    ),
    command: 'node main.js',
  },
  typescript: {
    path: 'main.ts',
    content: source(
      'function main(): void {',
      '  const message: string = "Hello, playground!";',
      '  console.log(message);',
      '}',
      '',
      'main();'
    ),
    command: 'bun main.ts',
  },
  c: {
    path: 'main.c',
    content: source(
      '#include <stdio.h>',
      '',
      'int main(void) {',
      '    puts("Hello, playground!");',
      '    return 0;',
      '}'
    ),
    command: 'gcc main.c -o /tmp/main && /tmp/main',
  },
  cpp: {
    path: 'main.cpp',
    content: source(
      '#include <iostream>',
      '',
      'int main() {',
      '    std::cout << "Hello, playground!" << std::endl;',
      '    return 0;',
      '}'
    ),
    command: 'g++ main.cpp -o /tmp/main && /tmp/main',
  },
  java: {
    path: 'Main.java',
    content: source(
      'public class Main {',
      '',
      '    public static void main(String[] args) {',
      '        System.out.println("Hello, playground!");',
      '    }',
      '}'
    ),
    command: 'javac Main.java && java Main',
  },
  rust: {
    path: 'main.rs',
    content: source('fn main() {', '    println!("Hello, playground!");', '}'),
    command: 'rustc main.rs -o /tmp/main && /tmp/main',
  },
  go: {
    path: 'main.go',
    content: source(
      'package main',
      '',
      'import "fmt"',
      '',
      'func main() {',
      '\tfmt.Println("Hello, playground!")',
      '}'
    ),
    command: 'go run main.go',
  },
  ruby: {
    path: 'main.rb',
    content: source(
      'def main',
      '  puts "Hello, playground!"',
      'end',
      '',
      'main'
    ),
    command: 'ruby main.rb',
  },
  php: {
    path: 'main.php',
    content: source(
      '<?php',
      '',
      'declare(strict_types=1);',
      '',
      'function main(): void',
      '{',
      '    echo "Hello, playground!\\n";',
      '}',
      '',
      'main();'
    ),
    command: 'php main.php',
  },
  shell: {
    path: 'main.sh',
    content: source(
      '#!/bin/sh',
      'set -eu',
      '',
      'main() {',
      '  printf "Hello, playground!\\n"',
      '}',
      '',
      'main'
    ),
    command: 'sh main.sh',
  },
};
