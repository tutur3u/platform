export const CODING_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'c',
  'cpp',
  'java',
  'rust',
  'go',
  'ruby',
  'php',
] as const;

export type CodingLanguage = (typeof CODING_LANGUAGES)[number];

export function isCodingLanguage(value: unknown): value is CodingLanguage {
  return CODING_LANGUAGES.includes(value as CodingLanguage);
}

export function starterCode(language: CodingLanguage, pythonStarter: string) {
  const templates: Record<CodingLanguage, string> = {
    python: pythonStarter,
    javascript:
      "const fs = require('node:fs');\nconst input = fs.readFileSync(0, 'utf8');\n// Read input and print your answer.\n",
    typescript:
      'async function main() {\n  const input = await Bun.stdin.text();\n  // Read input and print your answer.\n}\n\nvoid main();\n',
    c: '#include <stdio.h>\n\nint main(void) {\n  // Read input and print your answer.\n  return 0;\n}\n',
    cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  // Read input and print your answer.\n  return 0;\n}\n',
    java: 'import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner in = new Scanner(System.in);\n    // Read input and print your answer.\n  }\n}\n',
    rust: 'use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // Read input and print your answer.\n}\n',
    go: 'package main\n\nimport (\n    "fmt"\n    "os"\n)\n\nfunc main() {\n    _ = os.Stdin\n    // Read input and print your answer.\n    fmt.Print("")\n}\n',
    ruby: 'input = STDIN.read\n# Read input and print your answer.\n',
    php: '$input = stream_get_contents(STDIN);\n// Read input and print your answer.\n',
  };
  return templates[language];
}
