// @vitest-environment node
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { uploadObject as uploadShared } from '../../../../packages/storage-core/src/lib/storage-helper';
import { uploadObject as uploadNova } from '../../../nova/src/lib/storage-helper';
import { uploadObject as uploadRewise } from '../../../rewise/src/lib/storage-helper';

const sdkRequire = createRequire(
  resolve(import.meta.dirname, '../../../../packages/supabase/package.json')
);
const { createClient } = sdkRequire('@supabase/supabase-js');

for (const [label, upload] of [
  ['nova', uploadNova],
  ['rewise', uploadRewise],
  ['shared', uploadShared],
] as const) {
  it.each(['%41', '?', '#', 'Báo cáo', 'Báo cáo'.normalize('NFD')])(
    `${label} preserves caller paths and file extensions containing %s`,
    async (name) => {
      const keys: string[] = [];
      const urls: URL[] = [];
      const supabase = createClient('https://synthetic.invalid', 'synthetic', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            urls.push(url);
            const key = decodeURIComponent(
              url.pathname.slice('/storage/v1/object/workspaces/'.length)
            );
            keys.push(key);
            return Response.json({ Key: `workspaces/${key}` });
          },
        },
      });
      const path = `workspace/${name}/asset`;
      const file = new File(['synthetic'], `report.${name}`, {
        type: 'text/plain',
      });
      let logicalPath: string | undefined;
      let error: unknown;
      await upload({
        supabase,
        bucket: 'workspaces',
        path,
        file,
        onSuccess: (value) => {
          logicalPath = value;
        },
        onError: (value) => {
          error = value;
        },
      });
      expect(error).toBeUndefined();
      expect(keys).toEqual([`${path}.${name}`]);
      expect(logicalPath).toBe(`${path}.${name}`);
      expect(urls.map(({ search, hash }) => ({ search, hash }))).toEqual([
        { search: '', hash: '' },
      ]);
    }
  );
}
