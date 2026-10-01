import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const overlay = read('./com/cloudwebrtc/webrtc/OrientationAwareScreenCapturer.java');
const gradle = read('../../app/build.gradle.kts');
const plugin = read('../../app/src/main/kotlin/com/tuturuuu/app/mobile/meet/MeetScreenSharePlugin.kt');
const service = read('../../app/src/main/kotlin/com/tuturuuu/app/mobile/meet/MeetScreenShareService.kt');
const pinnedHash = '347ae60171cd831eb0fb28df7deeb6e81205881dac085eb3980e33edbe97a070';

test('the overlay preserves every upstream byte except the two Meet ownership additions and one whitespace cleanup', () => {
  const fieldsStart = overlay.indexOf('    private final CaptureOwner meetOwner;');
  const fieldsEnd = overlay.indexOf('    private int width;', fieldsStart);
  assert.ok(fieldsStart > 0 && fieldsEnd > fieldsStart);
  let upstream = overlay.slice(0, fieldsStart) + overlay.slice(fieldsEnd);
  const constructorStart = upstream.indexOf('        this.meetOwner = claimMeetCapture();');
  const constructorEnd = upstream.indexOf('\n    }', constructorStart);
  assert.ok(constructorStart > 0 && constructorEnd > constructorStart);
  upstream = upstream.slice(0, constructorStart) +
    '        this.mediaProjectionCallback = mediaProjectionCallback;' +
    upstream.slice(constructorEnd);
  // The upstream metrics helper has one spaces-only line; keep the overlay clean.
  upstream = upstream.replace('\n\n        return metrics.heightPixels',
    '\n        \n        return metrics.heightPixels');
  assert.equal(createHash('sha256').update(upstream).digest('hex'), pinnedHash);
});

test('Gradle excludes the original, installs repository overlay and pins upstream inputs', () => {
  assert.ok(gradle.includes(`hash == "${pinnedHash}"`));
  assert.ok(gradle.includes('version == "1.6.2+hotfix.3"'));
  assert.ok(gradle.includes('inputs.file(upstreamCapturer)'));
  assert.ok(gradle.includes('inputs.file(upstreamPubspec)'));
  assert.ok(gradle.includes('from(originalRoots) { exclude(relativeCapturer) }'));
  assert.ok(gradle.includes('from(overlayRoot) { include(relativeCapturer) }'));
  assert.ok(gradle.includes('mainJava.setSrcDirs(listOf(generatedJava))'));
  assert.ok(gradle.includes('dependsOn(prepareMeetWebRtc)'));
});

test('capture owner and service stop keep the same generation across the main-thread boundary', () => {
  assert.ok(overlay.includes('meetOwner == null ? mediaProjectionCallback'));
  assert.ok(overlay.includes('mediaProjection.unregisterCallback(mediaProjectionCallback)'));
  assert.ok(overlay.includes('meetOwner.notified.compareAndSet(false, true)'));
  assert.ok(plugin.includes('private val generations = AtomicLong()'));
  assert.ok(plugin.includes('OrientationAwareScreenCapturer.armMeetCapture(generation) { reportStopped(generation) }'));
  assert.ok(plugin.includes('activeGeneration != generation'));
  assert.ok(service.includes('intent.getLongExtra(GENERATION, 0L) == generation'));
  assert.ok(service.includes('val stoppedGeneration = generation'));
  assert.ok(service.includes('listener?.invoke(stoppedGeneration)'));
});
