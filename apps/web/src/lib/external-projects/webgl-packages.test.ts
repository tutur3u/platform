import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  buildWebglPackageArtifact,
  inferWebglAssetHeaders,
  isWebglZipUpload,
} from './webgl-packages';

const destinationPrefix =
  'external-projects/yoola/games/mine-blast/webgl-packages/mine-blast-webgl';

describe('WebGL package helpers', () => {
  it('accepts ZIP filenames and common ZIP content types', () => {
    expect(
      isWebglZipUpload({
        contentType: 'application/zip',
        filename: 'Mine Blast WebGL.zip',
      })
    ).toBe(true);
    expect(
      isWebglZipUpload({
        contentType: 'application/octet-stream',
        filename: 'build.zip',
      })
    ).toBe(true);
    expect(
      isWebglZipUpload({
        contentType: 'text/html',
        filename: 'index.html',
      })
    ).toBe(false);
  });

  it('builds an artifact map from a Unity export nested under one top-level folder', () => {
    const artifact = buildWebglPackageArtifact({
      archivePath: `${destinationPrefix}.zip`,
      assetId: 'asset-1',
      files: [
        {
          contentType: 'text/html',
          path: `${destinationPrefix}/Mine Blast WebGL/index.html`,
          size: 4853,
        },
        {
          contentType: 'application/javascript',
          path: `${destinationPrefix}/Mine Blast WebGL/Build/Mine Blast WebGL.loader.js`,
          size: 20642,
        },
        {
          contentType: 'application/octet-stream',
          path: `${destinationPrefix}/Mine Blast WebGL/Build/Mine Blast WebGL.data`,
          size: 22_387_152,
        },
        {
          contentType: 'application/wasm',
          path: `${destinationPrefix}/Mine Blast WebGL/Build/Mine Blast WebGL.wasm`,
          size: 35_990_054,
        },
        {
          contentType: 'image/png',
          path: `${destinationPrefix}/Mine Blast WebGL/TemplateData/webgl-logo.png`,
          size: 2947,
        },
      ],
      provider: 'supabase',
      wsId: 'ws-1',
    });

    expect(artifact.rootPath).toBe(`${destinationPrefix}/Mine Blast WebGL`);
    expect(artifact.entryRelativePath).toBe('index.html');
    expect(artifact.entryUrl).toBe(
      '/api/v1/workspaces/ws-1/external-projects/assets/asset-1/webgl/index.html'
    );
    expect(Object.keys(artifact.assetUrls)).toEqual([
      'index.html',
      'Build/Mine Blast WebGL.loader.js',
      'Build/Mine Blast WebGL.data',
      'Build/Mine Blast WebGL.wasm',
      'TemplateData/webgl-logo.png',
    ]);
    expect(artifact.files[2]).toMatchObject({
      contentType: 'application/octet-stream',
      relativePath: 'Build/Mine Blast WebGL.data',
      size: 22_387_152,
    });
  });

  it('rejects extracted packages without an index.html entry', () => {
    expect(() =>
      buildWebglPackageArtifact({
        archivePath: `${destinationPrefix}.zip`,
        assetId: 'asset-1',
        files: [
          {
            contentType: 'application/javascript',
            path: `${destinationPrefix}/Build/game.loader.js`,
            size: 123,
          },
        ],
        provider: 'supabase',
        wsId: 'ws-1',
      })
    ).toThrow('WebGL package must contain an index.html file.');
  });

  it('infers WebGL content types and compressed encodings', () => {
    expect(inferWebglAssetHeaders('Build/game.wasm')).toMatchObject({
      contentType: 'application/wasm',
    });
    expect(inferWebglAssetHeaders('Build/game.data')).toMatchObject({
      contentType: 'application/octet-stream',
    });
    expect(inferWebglAssetHeaders('Build/game.framework.js.br')).toEqual({
      contentEncoding: 'br',
      contentType: 'application/javascript; charset=utf-8',
    });
    expect(inferWebglAssetHeaders('index.html.gz')).toEqual({
      contentEncoding: 'gzip',
      contentType: 'text/html; charset=utf-8',
    });
  });
});
