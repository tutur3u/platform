package com.cloudwebrtc.webrtc;

/** App-facing capture ownership API without exposing WebRTC implementation types. */
public final class MeetScreenCaptureBridge {
    private MeetScreenCaptureBridge() {}

    public static void arm(long generation, Runnable stopped) {
        OrientationAwareScreenCapturer.armMeetCapture(generation, stopped);
    }

    public static void disarm(long generation) {
        OrientationAwareScreenCapturer.disarmMeetCapture(generation);
    }
}
