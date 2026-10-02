# Android Meet capture stop overlay

This overlay copies `OrientationAwareScreenCapturer.java` from flutter_webrtc
`1.6.2+hotfix.3` and adds a one-shot, generation-bound Meet capture owner. One upstream
spaces-only line in the metrics helper is normalized; the source verification
restores that known formatting-only exception before comparing the pinned hash. Its
MediaProjection callback stops capture and forwards Android OS revoke/lock to
Meet. An unarmed capturer keeps the upstream callback unchanged. Live assistant
capture uses its own service and never claims this owner.

`app/build.gradle.kts` validates the upstream pubspec version and original SHA256
before replacing this single source in generated plugin build storage. It never
writes into pub-cache. An upgrade must review this overlay and update the pinned
hash deliberately; missing or changed upstream source fails the build.

`MeetScreenCaptureBridge.java` is the app-facing ownership API. It delegates
inside the plugin, where WebRTC implementation dependencies are available.
Its public signatures use only `long` and `Runnable`, so app Kotlin compilation
does not need the capturer's private `VideoCapturer`/`VideoSink` supertypes.
The generated source task includes exactly this bridge and the capturer overlay;
no dependency version or API export is changed.

Original source SHA256:
`347ae60171cd831eb0fb28df7deeb6e81205881dac085eb3980e33edbe97a070`.

Android exact-commit CI compilation and consented synthetic physical-device tests
remain necessary: OS chip stop, lock, notification Stop, repeated stop, restart,
and unrelated assistant capture. Source verification alone does not prove those
runtime outcomes.

Generated build intermediates live in the plugin build directory inside the pub
cache. That directory must be writable; the pinned upstream source stays unchanged.
