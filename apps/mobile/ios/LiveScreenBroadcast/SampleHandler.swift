import Darwin
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
  private var meetGroup: String?
  private var socketDeadline: Date?
  private var socketFD: Int32 = -1
  private var pendingFrame: Data?
  private var pendingOffset = 0
  private var paused = false

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
    if session.transport == "meet" {
      meetGroup = group
      socketDeadline = Date().addingTimeInterval(10)
    }
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
    guard LiveScreenSession.current(in: directory)?.id == session.id else {
      stopped = true; cleanUp()
      finishBroadcastWithError(NSError(domain: "LiveScreenCapture", code: 2,
        userInfo: [NSLocalizedDescriptionKey: session.stopMessage]))
      return
    }
    if session.transport == "meet", socketFD < 0,
      let group = meetGroup, let deadline = socketDeadline, Date() < deadline {
      if openMeetSocket(group: group) { socketDeadline = nil; flushMeetFrame() }
      writeHeartbeat()
      return
    }
    if LiveScreenSession.current(in: directory)?.id != session.id ||
      (session.transport == "meet" && !meetSocketAlive()) {
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
    guard !stopped, !paused, sampleBufferType == .video,
      let directory, let session,
      LiveScreenSession.current(in: directory)?.id == session.id else { return }
    if session.transport == "meet" {
      flushMeetFrame()
      if stopped || pendingFrame != nil { return }
    }
    guard now - lastFrame >= (session.transport == "meet" ? 0.125 : 0.6),
      let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lastFrame = now
    autoreleasepool {
      var image = CIImage(cvPixelBuffer: pixelBuffer)
      if let orientation = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber {
        image = image.oriented(forExifOrientation: orientation.int32Value)
      }
      let scale = min(1, 1280 / max(image.extent.width, image.extent.height))
      image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
      if session.transport == "meet" {
        image = image.cropped(to: CGRect(x: 0, y: 0,
          width: floor(image.extent.width), height: floor(image.extent.height)))
      }
      guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
        let jpeg = context.jpegRepresentation(of: image, colorSpace: colorSpace,
          options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.65]),
        jpeg.count <= 512 * 1024 else { return }
      if session.transport == "meet" {
        // Pixels have already been oriented: the WebRTC reader must not rotate again.
        // The installed WebRTC reader cannot split excess bytes after a tiny
        // frame. Keep the body >= its initial 10 KiB read; JPEG ignores trailing
        // bytes after EOI, so Content-Length safely describes this padded body.
        var body = jpeg
        if body.count < 10 * 1024 { body.append(Data(count: 10 * 1024 - body.count)) }
        let header = "HTTP/1.1 200 OK\r\nContent-Length: \(body.count)\r\nBuffer-Width: \(Int(image.extent.width))\r\nBuffer-Height: \(Int(image.extent.height))\r\nBuffer-Orientation: 1\r\n\r\n"
        var frame = Data(header.utf8)
        frame.append(body)
        pendingFrame = frame; pendingOffset = 0
        flushMeetFrame()
      } else {
        try? jpeg.write(to: session.frame(in: directory), options: [.atomic, .completeFileProtection])
      }
    }
  }

  override func broadcastPaused() {
    lifecycle.lock(); defer { lifecycle.unlock() }
    paused = true
    guard let directory, let session else { return }
    try? FileManager.default.removeItem(at: session.frame(in: directory))
    try? Data("paused".utf8).write(to: session.status(in: directory), options: [.atomic, .completeFileProtection])
  }
  override func broadcastResumed() {
    lifecycle.lock(); defer { lifecycle.unlock() }
    paused = false
    guard let directory, let session else { return }
    try? Data("started".utf8).write(to: session.status(in: directory), options: [.atomic, .completeFileProtection])
  }
  override func broadcastFinished() {
    lifecycle.lock(); defer { lifecycle.unlock() }
    stopped = true; cleanUp()
  }

  private func openMeetSocket(group: String) -> Bool {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return false }
    let path = container.appendingPathComponent("rtc_SSFD").path
    var address = sockaddr_un()
    let bytes = Array(path.utf8) + [UInt8(0)]
    guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { return false }
    address.sun_family = sa_family_t(AF_UNIX)
    address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
    withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: bytes) }
    let descriptor = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
    guard descriptor >= 0 else { return false }
    guard fcntl(descriptor, F_SETFL, O_NONBLOCK) != -1 else {
      Darwin.close(descriptor); return false
    }
    // Prevent a peer disconnect from terminating the extension with SIGPIPE.
    var noSignal: Int32 = 1
    _ = setsockopt(descriptor, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
    let connected = withUnsafePointer(to: &address) {
      $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        Darwin.connect(descriptor, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
      }
    }
    guard connected == 0 else {
      Darwin.close(descriptor); return false
    }
    socketFD = descriptor
    return true
  }

  private func meetSocketAlive() -> Bool {
    guard socketFD >= 0 else { return false }
    var byte: UInt8 = 0
    let read = Darwin.recv(socketFD, &byte, 1, MSG_PEEK | MSG_DONTWAIT)
    return read > 0 || (read < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR))
  }

  private func flushMeetFrame() {
    guard socketFD >= 0, let frame = pendingFrame else { return }
    // One capped frame at a time. Never interleave partial HTTP messages or queue screenshots.
    let written = frame.withUnsafeBytes { buffer -> Int in
      guard let base = buffer.baseAddress else { return 0 }
      return Darwin.send(socketFD, base.advanced(by: pendingOffset), frame.count - pendingOffset, 0)
    }
    if written > 0 {
      pendingOffset += written
      if pendingOffset == frame.count { pendingFrame = nil; pendingOffset = 0 }
    } else if written == 0 || (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) {
      stopped = true; cleanUp()
      if let session {
        finishBroadcastWithError(NSError(domain: "LiveScreenCapture", code: 4,
          userInfo: [NSLocalizedDescriptionKey: session.stopMessage]))
      }
    }
  }

  private func cleanUp() {
    heartbeat?.cancel(); heartbeat = nil
    if socketFD >= 0 { Darwin.close(socketFD); socketFD = -1 }
    pendingFrame = nil; pendingOffset = 0
    guard let directory, let session else { return }
    try? FileManager.default.removeItem(at: session.frame(in: directory))
    try? FileManager.default.removeItem(at: session.alive(in: directory))
    try? Data("stopped".utf8).write(to: session.status(in: directory), options: [.atomic, .completeFileProtection])
  }
}
