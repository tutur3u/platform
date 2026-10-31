import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { guardApiProxyBody } from '../api-proxy-body';
import {
  getRequestContentViolationForRequest,
  validateRequestEmojiLimit,
} from '../request-emoji-limit';

const route = 'http://localhost/api/v1/workspaces/workspace/whiteboards/board';
const maxBytes = 8 * 1024 * 1024;

function request(body: string, url = route, method = 'PATCH') {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function board() {
  return {
    elements: Array.from({ length: 500 }, (_, index) => ({
      id: `shape-${index}`,
      type: 'rectangle',
      x: index * 20,
      y: 100,
      width: 100,
      height: 60,
      angle: 0,
      strokeColor: '#000000',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: index,
      version: 1,
      versionNonce: index,
      isDeleted: false,
      boundElements: [],
      updated: 1,
      link: null,
      locked: false,
    })),
    strokes: Array.from({ length: 12 }, (_, index) => ({
      id: `stroke-${index}`,
      type: 'freedraw',
      x: 0,
      y: 0,
      points: Array.from({ length: 6000 }, (_, point) => [
        point / 3,
        Math.sin(point / 10) * 100,
      ]),
      pressures: [],
      simulatePressure: true,
    })),
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  };
}

const validate = (body: string, url = route, method = 'PATCH') =>
  getRequestContentViolationForRequest(request(body, url, method), {
    skipValidationForFields: ['snapshot'],
  });

describe('whiteboard save request bounds', () => {
  it('accepts a realistic board above the generic byte and node budgets', async () => {
    const snapshot = board();
    const body = JSON.stringify({
      title: 'Planning',
      snapshot: {
        ...snapshot,
        elements: [...snapshot.elements, ...snapshot.strokes],
        strokes: undefined,
      },
    });
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(
      2 * 1024 * 1024
    );
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(maxBytes);
    await expect(guardApiProxyBody(request(body))).resolves.toBeNull();
    await expect(validate(body)).resolves.toBeNull();
  });

  it('accepts hundreds of shapes below the generic byte cap but above its node budget', async () => {
    const { elements } = board();
    const body = JSON.stringify({ snapshot: { elements } });
    expect(new TextEncoder().encode(body).byteLength).toBeLessThan(
      2 * 1024 * 1024
    );
    await expect(validate(body)).resolves.toBeNull();
  });

  it('strips the snapshot before depth checks', async () => {
    let snapshot: unknown = [];
    for (let i = 0; i < 65; i++) snapshot = { child: snapshot };
    await expect(validate(JSON.stringify({ snapshot }))).resolves.toBeNull();
  });

  it('accepts the exact byte limit and rejects one byte over without Content-Length', async () => {
    const overhead = JSON.stringify({ snapshot: '' }).length;
    await expect(
      validate(JSON.stringify({ snapshot: 'x'.repeat(maxBytes - overhead) }))
    ).resolves.toBeNull();
    const rejected = await validateRequestEmojiLimit(
      request(JSON.stringify({ snapshot: 'x'.repeat(maxBytes - overhead + 1) }))
    );
    expect(rejected?.status).toBe(400);
    const proxyRejected = await guardApiProxyBody(
      request(JSON.stringify({ snapshot: 'x'.repeat(maxBytes - overhead + 1) }))
    );
    expect(proxyRejected?.status).toBe(413);
    await expect(rejected?.json()).resolves.toMatchObject({
      code: 'REQUEST_COMPLEXITY_EXCEEDED',
      limit: maxBytes,
    });
  });

  it('retains validation for fields outside the snapshot', async () => {
    await expect(
      validate(JSON.stringify({ snapshot: {}, title: 'x'.repeat(281) }))
    ).resolves.toMatchObject({ code: 'TEXT_BOMB_DETECTED' });
    await expect(
      validate(
        JSON.stringify({
          snapshot: {},
          other: Array.from({ length: 10001 }, () => 0),
        })
      )
    ).resolves.toMatchObject({ code: 'REQUEST_COMPLEXITY_EXCEEDED' });
  });

  it.each([
    [route, 'POST'],
    ['http://localhost/api/v1/workspaces/workspace/whiteboards', 'PATCH'],
    ['http://localhost/api/v1/workspaces/workspace/tasks/task', 'PATCH'],
  ])('keeps generic byte limits for %s %s', async (url, method) => {
    await expect(
      validate(
        JSON.stringify({ snapshot: 'x'.repeat(2 * 1024 * 1024) }),
        url,
        method
      )
    ).resolves.toMatchObject({
      code: 'REQUEST_COMPLEXITY_EXCEEDED',
      limit: 2 * 1024 * 1024,
    });
  });
});
