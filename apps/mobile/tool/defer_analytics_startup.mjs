import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function deferAnalyticsStartup(source) {
  const field = '  private lateinit var analytics: FirebaseAnalytics';
  const eager = '    analytics = FirebaseAnalytics.getInstance(context)';
  for (const expected of [field, eager]) {
    if (source.split(expected).length !== 2) {
      throw new Error('Firebase Analytics startup source changed; review the consent patch');
    }
  }
  return source.replace(field, [
    '  private lateinit var analyticsContext: Context',
    '  private val analytics: FirebaseAnalytics by lazy {',
    '    FirebaseAnalytics.getInstance(analyticsContext)',
    '  }',
  ].join('\n')).replace(eager, '    analyticsContext = context.applicationContext');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error('Expected input and output Kotlin source paths');
  writeFileSync(output, deferAnalyticsStartup(readFileSync(input, 'utf8')));
}
