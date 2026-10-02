import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const overlay = read('./com/cloudwebrtc/webrtc/OrientationAwareScreenCapturer.java');
const bridge = read('./com/cloudwebrtc/webrtc/MeetScreenCaptureBridge.java');
const gradle = read('../../app/build.gradle.kts');
const plugin = read('../../app/src/main/kotlin/com/tuturuuu/app/mobile/meet/MeetScreenSharePlugin.kt');
const service = read('../../app/src/main/kotlin/com/tuturuuu/app/mobile/meet/MeetScreenShareService.kt');
const pinnedHash = '347ae60171cd831eb0fb28df7deeb6e81205881dac085eb3980e33edbe97a070';

test('the overlay preserves every upstream byte except bounded Meet ownership/cancellation additions and frame accounting', () => {
  const fieldsStart = overlay.indexOf('    private final CaptureOwner meetOwner;');
  const fieldsEnd = overlay.indexOf('    private int width;', fieldsStart);
  assert.ok(fieldsStart > 0 && fieldsEnd > fieldsStart);
  let upstream = overlay.slice(0, fieldsStart) + overlay.slice(fieldsEnd);
  const constructorStart = upstream.indexOf('        this.meetOwner = claimMeetCapture(this);');
  const constructorEnd = upstream.indexOf('\n    }', constructorStart);
  assert.ok(constructorStart > 0 && constructorEnd > constructorStart);
  upstream = upstream.slice(0, constructorStart) +
    '        this.mediaProjectionCallback = mediaProjectionCallback;' +
    upstream.slice(constructorEnd);
  upstream = upstream.replace('        numCapturedFrames++;\n', '')
    .replace('        if (isStopped) throw new IllegalStateException("Meet capture was cancelled");\n', '')
    .replace('        // Wait for synchronized startup, but never hold the monitor while\n        // waiting on the helper thread (onFrame can enter changeCaptureFormat).\n        synchronized (this) {\n            if (isDisposed || isStopped) return;\n            isStopped = true;\n        }', '        if (isDisposed || isStopped) return;\n        isStopped = true;')
    .replace('        releaseMeetCapture(meetOwner);\n        if (surfaceTextureHelper == null) return;\n', '');
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
  assert.ok(gradle.includes('from(overlayRoot) { include(relativeCapturer, relativeBridge) }'));
  assert.ok(gradle.includes('overlayRoot.resolve(relativeBridge).isFile'));
  assert.ok(gradle.includes('mainJava.setSrcDirs(listOf(generatedJava))'));
  assert.ok(gradle.includes('dependsOn(prepareMeetWebRtc)'));
});

test('capture owner and service stop keep the same generation across the main-thread boundary', () => {
  assert.ok(overlay.includes('meetOwner == null ? mediaProjectionCallback'));
  assert.ok(overlay.includes('mediaProjection.unregisterCallback(mediaProjectionCallback)'));
  assert.ok(overlay.includes('meetOwner.notified.compareAndSet(false, true)'));
  assert.ok(plugin.includes('private val generations = AtomicLong()'));
  assert.ok(plugin.includes('MeetScreenCaptureBridge.arm(generation) { reportStopped(generation) }'));
  assert.ok(plugin.includes('activeGeneration != generation'));
  assert.ok(service.includes('intent.getLongExtra(GENERATION, 0L) == generation'));
  assert.ok(service.includes('val stoppedGeneration = generation'));
  assert.ok(service.includes('listener?.invoke(stoppedGeneration)'));
});

test('the app-facing ownership boundary does not require private WebRTC supertypes', () => {
  assert.ok(bridge.includes('public final class MeetScreenCaptureBridge {'));
  assert.ok(bridge.includes('public static void arm(long generation, Runnable stopped)'));
  assert.ok(bridge.includes('public static void disarm(long generation)'));
  assert.ok(bridge.includes('OrientationAwareScreenCapturer.armMeetCapture(generation, stopped)'));
  assert.ok(bridge.includes('OrientationAwareScreenCapturer.disarmMeetCapture(generation)'));
  assert.ok(!bridge.includes('org.webrtc'));
  assert.ok(!plugin.includes('OrientationAwareScreenCapturer'));
  assert.ok(plugin.includes('MeetScreenCaptureBridge.stop(generation)'));
  assert.ok(bridge.includes('OrientationAwareScreenCapturer.stopMeetCapture(generation)'));
  assert.ok(overlay.includes('if (mediaProjectionCallback != null) mediaProjectionCallback.onStop()'));
  assert.ok(overlay.includes('owner.capturer.stopCapture()'));
  assert.ok(overlay.includes('numCapturedFrames++'));
  assert.ok(overlay.includes('activeMeetOwners.remove(owner.generation, owner)'));
});
