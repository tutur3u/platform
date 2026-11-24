import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import { languageForPath } from '../workbench-language';

/**
 * Real formatters, loaded only when someone asks to format. Each one is a
 * dynamic import, so no formatter code or WebAssembly reaches the page until
 * its first use.
 */
export interface Formatter {
  /** Product name, for the failure message. */
  name: string;
  format: (source: string, path: string) => Promise<string>;
}

/** Why a file has no formatter, as a message key suffix. */
export type NoFormatterReason = 'rust' | 'ruby' | 'unknown';

export type FormatSupport =
  | { supported: true; formatter: Formatter; language: PlaygroundLanguage }
  | { supported: false; reason: NoFormatterReason };

/**
 * Where a WebAssembly formatter's binary comes from. The default is the URL the
 * package resolves next to itself, which bundlers emit as an asset; a test
 * supplies the bytes instead, because Node cannot fetch a file URL.
 */
let wasmSource: (name: WasmFormatter) => BufferSource | undefined = () =>
  undefined;
type WasmFormatter = 'ruff_fmt' | 'clang-format' | 'gofmt' | 'shfmt';
export function setWasmSource(
  source: (name: WasmFormatter) => BufferSource | undefined
) {
  wasmSource = source;
}

const once = <T>(load: () => Promise<T>) => {
  let pending: Promise<T> | undefined;
  return () => {
    // A failed load (offline) is retried on the next request.
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
};

const prettierCore = once(async () => {
  const [{ format }, babel, estree] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
  ]);
  return { format, plugins: [babel, estree] };
});

const javascript: Formatter = {
  name: 'Prettier',
  async format(source) {
    const { format, plugins } = await prettierCore();
    return format(source, { parser: 'babel', plugins, tabWidth: 2 });
  },
};

const typescript: Formatter = {
  name: 'Prettier',
  async format(source) {
    const [{ format, plugins }, ts] = await Promise.all([
      prettierCore(),
      import('prettier/plugins/typescript'),
    ]);
    return format(source, {
      parser: 'typescript',
      plugins: [...plugins, ts],
      tabWidth: 2,
    });
  },
};

const java: Formatter = {
  name: 'Prettier Java',
  async format(source) {
    const [{ format }, plugin] = await Promise.all([
      import('prettier/standalone'),
      import('prettier-plugin-java'),
    ]);
    return format(source, {
      parser: 'java',
      plugins: [plugin.default ?? plugin],
      tabWidth: 4,
    });
  },
};

const php: Formatter = {
  name: 'Prettier PHP',
  async format(source) {
    const [{ format }, plugin] = await Promise.all([
      import('prettier/standalone'),
      import('@prettier/plugin-php/standalone'),
    ]);
    return format(source, {
      parser: 'php',
      plugins: [plugin.default ?? plugin],
      tabWidth: 4,
    });
  },
};

const ruff = once(async () => {
  const wasm = await import('@wasm-fmt/ruff_fmt/web');
  await wasm.default(wasmSource('ruff_fmt'));
  return wasm;
});

const python: Formatter = {
  name: 'Ruff',
  async format(source, path) {
    return (await ruff()).format(source, path);
  },
};

const clang = once(async () => {
  const wasm = await import('@wasm-fmt/clang-format/web');
  await wasm.default(wasmSource('clang-format'));
  return wasm;
});

const clangStyle = '{BasedOnStyle: LLVM, IndentWidth: 4}';
const cFamily: Formatter = {
  name: 'clang-format',
  async format(source, path) {
    return (await clang()).format(source, path, clangStyle);
  },
};

const gofmt = once(async () => {
  const wasm = await import('@wasm-fmt/gofmt/web');
  await wasm.default(wasmSource('gofmt'));
  return wasm;
});

const go: Formatter = {
  name: 'gofmt',
  async format(source) {
    return (await gofmt()).format(source);
  },
};

const shfmt = once(async () => {
  const wasm = await import('@wasm-fmt/shfmt/web');
  await wasm.default(wasmSource('shfmt'));
  return wasm;
});

const shell: Formatter = {
  name: 'shfmt',
  async format(source, path) {
    return (await shfmt()).format(source, path, { indent: 2 });
  },
};

/** Rust and Ruby have no maintained browser formatter, so they stay disabled. */
const FORMATTERS: Partial<Record<PlaygroundLanguage, Formatter>> = {
  python,
  javascript,
  typescript,
  c: cFamily,
  cpp: cFamily,
  java,
  go,
  php,
  shell,
};

/** What formatting a file does: the formatter for its extension, or why there is none. */
export function formatSupport(path: string | undefined): FormatSupport {
  const language = path ? languageForPath(path) : undefined;
  if (!language) return { supported: false, reason: 'unknown' };
  const formatter = FORMATTERS[language];
  if (formatter) return { supported: true, formatter, language };
  return {
    supported: false,
    reason: language === 'rust' ? 'rust' : 'ruby',
  };
}

export const FORMATTABLE_LANGUAGES = Object.keys(
  FORMATTERS
) as PlaygroundLanguage[];
