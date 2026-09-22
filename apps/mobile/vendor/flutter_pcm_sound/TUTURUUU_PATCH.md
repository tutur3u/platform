# Tuturuuu iOS audio session patch

The iOS plugin changes the shared AVAudioSession category only when it differs
from the requested category. When Live capture has already configured
playAndRecord, preserve its route options during PCM reinitialization instead of
resetting Bluetooth/speaker/voice-processing configuration.

AssistantLiveAudioPlayer serializes setup, feed, clear, and release, and copies
PCM sublist views before feeding the plugin. Keep these behaviors when updating
the vendored plugin. Verify playback while recording, interruption, headset
switching, and cleanup on a physical iOS device; simulator input can be absent.
