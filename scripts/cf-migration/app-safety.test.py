import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

GENERATOR = Path(__file__).with_name('app-safety.py')

class GeneratorTest(unittest.TestCase):
    def generate(self, app, build='next build --turbopack', legacy=None):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        root = Path(scratch.name)
        target = root / 'apps' / app
        (target / 'cloudflare').mkdir(parents=True)
        (target / 'cloudflare/worker.ts').write_text('    let response: Response;\n    if (!resolveAppBase(url)) return;\n    const response = await handle();\n')
        (target / 'void.config.ts').write_text('workers_dev: false,\n')
        (target / 'vite.config.mts').write_text('  define: bridge.define,\n')
        scripts = {'build': build}
        if legacy is not None:
            scripts['build:legacy'] = legacy
        (target / 'package.json').write_text(json.dumps({'scripts': scripts}))
        (target / 'vercel.json').write_text(json.dumps({'regions': ['sin1']}))
        result = subprocess.run([sys.executable, str(GENERATOR), app], cwd=root, capture_output=True, text=True)
        return target, result

    def test_six_observed_app_names_preserve_shared_secret_and_dependency_build(self):
        for app in ['hive', 'infrastructure', 'learn', 'pay', 'contacts', 'drive']:
            with self.subTest(app=app):
                root, result = self.generate(app)
                self.assertEqual(result.returncode, 0, result.stderr)
                runtime = (root / 'cloudflare/cutover.runtime.mjs').read_text()
                bindings = (root / 'cloudflare/required-bindings.ts').read_text()
                for source in [runtime, bindings]:
                    self.assertIn('TUTURUUU_APP_COORDINATION_SECRET', source)
                    self.assertNotIn(f'TUTURUUU_{app}_COORDINATION_SECRET', source)
                self.assertIn(f'{app}.tuturuuu.com', runtime)
                self.assertNotIn('__APP_ID__', runtime)
                config = json.loads((root / 'vercel.json').read_text())
                self.assertEqual(config['regions'], ['sin1'])
                self.assertEqual(config['buildCommand'], f'cd ../.. && bun turbo:local run build --filter="@tuturuuu/{app}^..." && bun run --cwd apps/{app} build:legacy')

    def test_retained_legacy_script_survives_native_default(self):
        root, result = self.generate('contacts', build='vp build', legacy='next build --turbopack')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((root / 'package.json').read_text())['scripts'], {'build': 'vp build', 'build:legacy': 'next build --turbopack'})

    def test_missing_legacy_refuses_before_writing_cloudflare_files(self):
        root, result = self.generate('drive', build='vp build')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((root / 'cloudflare/cutover.runtime.mjs').exists())
        self.assertFalse((root / 'cloudflare/required-bindings.ts').exists())

if __name__ == '__main__':
    unittest.main()
