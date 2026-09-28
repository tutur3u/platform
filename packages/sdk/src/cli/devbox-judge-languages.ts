export const JUDGE_LANGUAGES = [
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

export type JudgeLanguage = (typeof JUDGE_LANGUAGES)[number];

export function isJudgeLanguage(value: unknown): value is JudgeLanguage {
  return JUDGE_LANGUAGES.includes(value as JudgeLanguage);
}

export function minimumJudgeMemoryMb(language: JudgeLanguage) {
  return ['java', 'rust', 'go'].includes(language) ? 512 : 128;
}

export function judgeLanguageBinary(language: JudgeLanguage) {
  return {
    python: 'python3',
    javascript: 'node',
    typescript: 'bun',
    c: 'gcc',
    cpp: 'g++',
    java: 'javac',
    rust: 'rustc',
    go: 'go',
    ruby: 'ruby',
    php: 'php',
  }[language];
}

export function createJudgeLanguageCommand({
  language,
  memoryMb,
  source,
}: {
  language: JudgeLanguage;
  memoryMb: number;
  source: string;
}): string[] {
  if (language === 'python') return ['python3', '-I', '-S', '-B', '-c', source];
  if (language === 'javascript') return ['node', '-e', source];
  if (language === 'typescript') return ['bun', '-e', source];
  if (language === 'ruby') return ['ruby', '-e', source];
  if (language === 'php') return ['php', '-r', source];

  const encoded = Buffer.from(source).toString('base64');
  const compile = {
    c: 'gcc -O2 -std=c17 /tmp/main.c -o /tmp/main',
    cpp: 'g++ -O2 -std=c++20 /tmp/main.cpp -o /tmp/main',
    java: 'javac -d /tmp /tmp/Main.java',
    rust: 'rustc -O /tmp/main.rs -o /tmp/main',
    go: 'GOCACHE=/tmp/go-cache GOMODCACHE=/tmp/go-mod GOTOOLCHAIN=local go build -o /tmp/main /tmp/main.go',
  }[language];
  const extension = {
    c: 'main.c',
    cpp: 'main.cpp',
    java: 'Main.java',
    rust: 'main.rs',
    go: 'main.go',
  }[language];
  const execute =
    language === 'java'
      ? `java -Xmx${Math.max(128, memoryMb - 128)}m -cp /tmp Main`
      : '/tmp/main';
  const script = `set -eu; printf %s "$1" | base64 -d > /tmp/${extension}; ${compile} >&2 || exit 100; exec ${execute}`;
  return ['sh', '-c', script, '--', encoded];
}
