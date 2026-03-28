## 3.3.3
* **[Docs]** update readme

## 3.3.2
* **[Docs]** update readme

## 3.3.1
* **[Fix]** more potential race conditions (theoretical)

## 3.3.0
* **[Fix]** potential race conditions that could theoretically cause `OnFeedSamples` to misfire

## 3.2.6
* **[Docs]** more docs clarifications

## 3.2.5
* **[Docs]** document when the feed callback is invoked

## 3.2.4
* **[Fix]** calling `start` could cause null deref

## 3.2.3
* **[Fix]** iOS: prevent audio blips when locking screen

## 3.2.2
* **[Fix]** iOS: avoid `AudioOutputUnitStart` error 561015905 when resuming after screen lock → unlock

## 3.2.1
(redacted)

## 3.2.0
* **[Feature]** `start` returns true if it invoked your callback

## 3.1.7
* **[Fix]** Android: allow `feed` to be called with zero length buffer

## 3.1.6
* **[Improve]** calling `start` again when already started will do nothing, as expected.

## 3.1.5
* **[Feature]** Android & iOS: invoke feed callback when remainingFrames=0 to signal that playback stopped

## 3.1.4
* **[Fix]** Android: callback could be skipped sometimes

## 3.1.3
* **[Feature]** add `playAndRecord` iOS category

## 3.1.2
* **[Improve]** add `setup` check before feed

## 3.1.1
* **[Improve]** Android: feed 200 samples at a time, to align with common feed rates
* **[Improve]** iOS: don't try to play until setup is called

## 3.1.0
* **[API]** remove -1 feed threshold support

## 3.0.1
* **[API]** iOS: clear input samples to prevent annoying noises when debugging

## 3.0.0
* **[API]** simplify api: remove `start`
* **[API]** simplify api: remove `stop`
* **[API]** simplify api: to start & stop, just feed & stop feeding.
* **[API]** simplify api: remove `remainingSamples`. uneeded.

## 2.0.0
* **[API]** simplify api: combine `pause` & `stop` into single function

## 1.2.7
* **[Fix]** Example: accidentally pushed changes

## 1.2.6
* **[Improve]** Android: continue to refine htz

## 1.2.5
* **[Improve]** Android: target 100htz when feed theshold is not set

## 1.2.4
* **[Feature]** `setFeedThreshold(-1)` will ignore the threshold 

## 1.2.3
* **[Fix]** Android: setLogLevel would hang

## 1.2.2
* **[Fix]** MacOS: fix warnings

## 1.2.1
* **[Fix]** Android: Fix crash when releasing PCM player

## 1.2.0
* **[Feature]** iOS: add support for AVAudioSessionCategory

## 1.1.0
* **[Fix]** android: fix crash when `release` is called

## 1.0.1
* **[Readme]** update

## 1.0.0
* **[Feature]** Initial Release.
