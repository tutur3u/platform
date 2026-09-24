import CoreImage
import ImageIO
import ReplayKit

final class SampleHandler: RPBroadcastSampleHandler {
  private var session: LiveScreenSession?
  private var directory: URL?
  private var heartbeat: DispatchSourceTimer?
  private let context = CIContext(options: [.cacheIntermediates: false])
  private var lastFrame: TimeInterval = 0
  private var stopped = false
  private let lifecycle = NSRecursiveLock()

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    lifecycle.lock(); defer { lifecycle.unlock() }
    guard let group = Bundle.main.object(forInfoDictionaryKey: "LiveScreenAppGroup") as? String,
      let directory = try? LiveScreenSession.directory(group: group),
      let session = LiveScreenSession.current(in: directory) else {
      finishBroadcastWithError(NSError(domain: "LiveScreenCapture", code: 1,
        userInfo: [NSLocalizedDescriptionKey: NSLocalizedString("Open a Live conversation to share your screen.", comment: "")]))
      return
    }
    self.directory = directory; self.session = session
    writeHeartbeat()
    try? Data("started".utf8).write(to: session.status(in: directory), options: [.atomic, .completeFileProtection])
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now(), repeating: 1)
    timer.setEventHandler { [weak self] in self?.checkSession() }
    heartbeat = timer; timer.resume()
  }

  private func checkSession() {
    lifecycle.lock(); defer { lifecycle.unlock() }
    guard !stopped, let directory, let session else { return }
    if LiveScreenSession.current(in: directory)?.id != session.id {
      stopped = true
      finishBroadcastWithError(NSError(domain: "LiveScreenCapture", code: 2,
        userInfo: [NSLocalizedDescriptionKey: session.stopMessage]))
      cleanUp()
    } else {
      writeHeartbeat()
    }
  }

  private func writeHeartbeat() {
    guard let directory, let session else { return }
    try? Data(String(Date().timeIntervalSince1970).utf8).write(
      to: session.alive(in: directory), options: [.atomic, .completeFileProtection])
  }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    lifecycle.lock(); defer { lifecycle.unlock() }
    let now = Date().timeIntervalSince1970
    guard !stopped, sampleBufferType == .video,
      now - lastFrame >= 0.6,
      let directory, let session,
      LiveScreenSession.current(in: directory)?.id == session.id,
      let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lastFrame = now
    autoreleasepool {
      var image = CIImage(cvPixelBuffer: pixelBuffer)
      if let orientation = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber {
        image = image.oriented(forExifOrientation: orientation.int32Value)
      }
      let scale = min(1, 1280 / max(image.extent.width, image.extent.height))
      image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
        let jpeg = context.jpegRepresentation(of: image, colorSpace: colorSpace,
          options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.65]),
        jpeg.count <= 512 * 1024 else { return }
      try? jpeg.write(to: session.frame(in: directory), options: [.atomic, .completeFileProtection])
    }
  }

  override func broadcastPaused() {
    lifecycle.lock(); defer { lifecycle.unlock() }
    guard let directory, let session else { return }
    try? FileManager.default.removeItem(at: session.frame(in: directory))
    try? Data("paused".utf8).write(to: session.status(in: directory), options: [.atomic, .completeFileProtection])
  }
  override func broadcastResumed() {
    lifecycle.lock(); defer { lifecycle.unlock() }
    guard let directory, let session else { return }
    try? Data("started".utf8).write(to: session.status(in: directory), options: [.atomic, .completeFileProtection])
  }
  override func broadcastFinished() {
    lifecycle.lock(); defer { lifecycle.unlock() }
    stopped = true; cleanUp()
  }

  private func cleanUp() {
    heartbeat?.cancel(); heartbeat = nil
    guard let directory, let session else { return }
    try? FileManager.default.removeItem(at: session.frame(in: directory))
    try? FileManager.default.removeItem(at: session.alive(in: directory))
    try? Data("stopped".utf8).write(to: session.status(in: directory), options: [.atomic, .completeFileProtection])
  }
}
