import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { playgroundTemplates } from '../../../utils/src/playground-templates';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FORMATTABLE_LANGUAGES,
  formatSupport,
  setWasmSource,
} from './formatters';

const require = createRequire(import.meta.url);
beforeAll(() =>
  // Node cannot fetch the file URL a bundler would serve, so give the bytes.
  setWasmSource((name) =>
    readFileSync(require.resolve(`@wasm-fmt/${name}/wasm`))
  )
);

const messy: Record<string, [path: string, source: string]> = {
  python: ['main.py', 'def  main( ):\n  print( "hi" )\nmain( )\n'],
  javascript: ['main.js', 'function  main( ){console.log( "hi" )}\nmain( )\n'],
  typescript: [
    'main.ts',
    'function  main( ):void{const x:number=1;console.log(x)}\nmain( )\n',
  ],
  c: ['main.c', '#include <stdio.h>\nint main(void){puts("hi");return 0;}\n'],
  cpp: [
    'main.cpp',
    '#include <iostream>\nint main(){std::cout<<"hi"<<std::endl;return 0;}\n',
  ],
  java: [
    'Main.java',
    'public class Main{public static void main(String[] a){System.out.println("hi");}}\n',
  ],
  go: [
    'main.go',
    'package main\nimport "fmt"\nfunc main(){fmt.Println("hi")}\n',
  ],
  php: ['main.php', '<?php\nfunction  main( ){echo "hi";}\nmain( );\n'],
  shell: ['main.sh', 'main(){\nprintf "hi\\n"\n}\nmain\n'],
};

describe('formatters', () => {
  it('covers exactly the languages that have a maintained browser formatter', () => {
    expect([...FORMATTABLE_LANGUAGES].sort()).toEqual(
      [
        'c',
        'cpp',
        'go',
        'java',
        'javascript',
        'php',
        'python',
        'shell',
        'typescript',
      ].sort()
    );
    expect(formatSupport('main.rs')).toEqual({
      supported: false,
      reason: 'rust',
    });
    expect(formatSupport('main.rb')).toEqual({
      supported: false,
      reason: 'ruby',
    });
    expect(formatSupport('README.md')).toEqual({
      supported: false,
      reason: 'unknown',
    });
    expect(formatSupport(undefined)).toEqual({
      supported: false,
      reason: 'unknown',
    });
  });

  it.each(Object.keys(messy))(
    'formats %s source',
    async (language) => {
      const [path, source] = messy[language]!;
      const support = formatSupport(path);
      if (!support.supported) throw new Error('expected a formatter');
      const out = await support.formatter.format(source, path);
      expect(out).not.toBe(source);
      expect(out.endsWith('\n')).toBe(true);
      expect(out.split('\n').length).toBeGreaterThan(
        source.split('\n').length - 1
      );
      // Formatting is stable: a formatted file stays as it is.
      expect(await support.formatter.format(out, path)).toBe(out);
    },
    60_000
  );

  it.each(
    PLAYGROUND_LANGUAGES.filter((language) =>
      FORMATTABLE_LANGUAGES.includes(language)
    )
  )(
    'leaves the %s starter file as its own formatter writes it',
    async (language) => {
      const { path, content } = playgroundTemplates[language];
      const support = formatSupport(path);
      if (!support.supported) throw new Error('expected a formatter');
      expect(await support.formatter.format(content, path)).toBe(content);
    },
    60_000
  );
});
