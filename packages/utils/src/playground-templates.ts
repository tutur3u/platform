import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
export const playgroundTemplates: Record<
  PlaygroundLanguage,
  { path: string; content: string; command: string }
> = {
  python: {
    path: 'main.py',
    content: 'print("Hello, playground!")\n',
    command: 'python3 main.py',
  },
  javascript: {
    path: 'main.js',
    content: 'console.log("Hello, playground!");\n',
    command: 'node main.js',
  },
  typescript: {
    path: 'main.ts',
    content: 'console.log("Hello, playground!");\n',
    command: 'bun main.ts',
  },
  c: {
    path: 'main.c',
    content:
      '#include <stdio.h>\nint main(void) { puts("Hello, playground!"); }\n',
    command: 'gcc main.c -o /tmp/main && /tmp/main',
  },
  cpp: {
    path: 'main.cpp',
    content:
      '#include <iostream>\nint main() { std::cout << "Hello, playground!\\n"; }\n',
    command: 'g++ main.cpp -o /tmp/main && /tmp/main',
  },
  java: {
    path: 'Main.java',
    content:
      'class Main { public static void main(String[] args) { System.out.println("Hello, playground!"); } }\n',
    command: 'javac Main.java && java Main',
  },
  rust: {
    path: 'main.rs',
    content: 'fn main() { println!("Hello, playground!"); }\n',
    command: 'rustc main.rs -o /tmp/main && /tmp/main',
  },
  go: {
    path: 'main.go',
    content:
      'package main\nimport "fmt"\nfunc main() { fmt.Println("Hello, playground!") }\n',
    command: 'go run main.go',
  },
  ruby: {
    path: 'main.rb',
    content: 'puts "Hello, playground!"\n',
    command: 'ruby main.rb',
  },
  php: {
    path: 'main.php',
    content: '<?php echo "Hello, playground!\\n";\n',
    command: 'php main.php',
  },
  shell: {
    path: 'main.sh',
    content: 'printf "Hello, playground!\\n"\n',
    command: 'sh main.sh',
  },
};
