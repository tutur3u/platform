import Flutter
import ReplayKit
import UIKit

final class LiveScreenCapturePlugin: NSObject, FlutterPlugin, FlutterStreamHandler {
  private var sink: FlutterEventSink?
  private var timer: DispatchSourceTimer?
  private var session: LiveScreenSession?
  private var directory: URL?
  private var lastStatus = ""
  private var startedAt: Date?

  static func register(with registrar: FlutterPluginRegistrar) {
    let instance = LiveScreenCapturePlugin()
    registrar.addMethodCallDelegate(instance, channel: FlutterMethodChannel(name: "mobile/live_screen_capture", binaryMessenger: registrar.messenger()))
    FlutterEventChannel(name: "mobile/live_screen_capture/events", binaryMessenger: registrar.messenger()).setStreamHandler(instance)
    NotificationCenter.default.addObserver(instance, selector: #selector(stop), name: UIApplication.willTerminateNotification, object: nil)
    NotificationCenter.default.addObserver(instance, selector: #selector(stop), name: UIApplication.protectedDataWillBecomeUnavailableNotification, object: nil)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    if call.method == "stop" { stop(); result(nil); return }
    guard call.method == "start" else { result(FlutterMethodNotImplemented); return }
    guard session == nil, sink != nil,
      let arguments = call.arguments as? [String: Any],
      let stopMessage = arguments["stopMessage"] as? String,
      let identifier = Bundle.main.bundleIdentifier,
      let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows }).first(where: { $0.isKeyWindow }),
      let directory = try? LiveScreenSession.directory(group: "group.\(identifier).live") else {
      result(FlutterError(code: "capture_unavailable", message: "Screen capture unavailable", details: nil)); return
    }
    do {
      // This dedicated directory contains only transient, capture-session data.
      for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
        try FileManager.default.removeItem(at: file)
      }
      let session = LiveScreenSession(id: UUID().uuidString, heartbeat: Date().timeIntervalSince1970, stopMessage: stopMessage)
      try session.write(in: directory)
      self.session = session; self.directory = directory; startedAt = Date(); lastStatus = ""
      let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 48, height: 48))
      picker.preferredExtension = "\(identifier).LiveScreenBroadcast"
      picker.showsMicrophoneButton = false // The existing Live voice recorder owns microphone consent.
      window.addSubview(picker)
      guard let button = picker.subviews.compactMap({ $0 as? UIButton }).first else { throw NSError(domain: "LiveScreenCapture", code: 3) }
      button.sendActions(for: .touchUpInside)
      DispatchQueue.main.asyncAfter(deadline: .now() + 1) { picker.removeFromSuperview() }
      let timer = DispatchSource.makeTimerSource(queue: .main)
      timer.schedule(deadline: .now(), repeating: .milliseconds(500))
      timer.setEventHandler { [weak self] in self?.poll() }
      self.timer = timer; timer.resume()
      result(true)
    } catch { stop(); result(FlutterError(code: "capture_unavailable", message: "Screen capture unavailable", details: nil)) }
  }

  private func poll() {
    guard let session, let directory else { return }
    do {
      try LiveScreenSession(id: session.id, heartbeat: Date().timeIntervalSince1970, stopMessage: session.stopMessage).write(in: directory)
      let status = (try? String(contentsOf: session.status(in: directory), encoding: .utf8)) ?? ""
      if status != lastStatus && !status.isEmpty {
        lastStatus = status
        if status == "stopped" { stop(); return }
        sink?(["type": status])
      }
      if lastStatus.isEmpty, let startedAt, Date().timeIntervalSince(startedAt) > 60 { stop(); return }
      if lastStatus == "started" || lastStatus == "paused" {
        guard let alive = try? String(contentsOf: session.alive(in: directory), encoding: .utf8),
          let heartbeat = TimeInterval(alive),
          abs(Date().timeIntervalSince1970 - heartbeat) < 10 else { stop(); return }
      }
      let frame = session.frame(in: directory)
      if lastStatus == "started", let data = try? Data(contentsOf: frame), data.count <= 512 * 1024 {
        try? FileManager.default.removeItem(at: frame)
        sink?(["type": "frame", "bytes": FlutterStandardTypedData(bytes: data)])
      }
    } catch { stop() }
  }

  @objc private func stop() {
    timer?.cancel(); timer = nil
    if let directory, let session {
      try? FileManager.default.removeItem(at: directory.appendingPathComponent("session.json"))
      try? FileManager.default.removeItem(at: session.frame(in: directory))
      try? FileManager.default.removeItem(at: session.status(in: directory))
      try? FileManager.default.removeItem(at: session.alive(in: directory))
    }
    session = nil; directory = nil; lastStatus = ""; startedAt = nil
    sink?(["type": "stopped"])
  }
  func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? { sink = events; return nil }
  func onCancel(withArguments arguments: Any?) -> FlutterError? { stop(); sink = nil; return nil }
  func detachFromEngine(for registrar: FlutterPluginRegistrar) {
    stop(); sink = nil
    NotificationCenter.default.removeObserver(self)
  }
  deinit { timer?.cancel(); NotificationCenter.default.removeObserver(self) }
}
