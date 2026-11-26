import Flutter
import Foundation
import WatchConnectivity

/// Pure wire envelope builder tested by `RunnerTests` and shared with `TuturuuuWatch`.
enum WatchCompanionWire {
  static let currentVersion = 1

  static func makeApplicationContext(jsonPayload: String) -> [String: Any]? {
    let trimmed = jsonPayload.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else {
      return nil
    }
    return [
      "v": currentVersion,
      "payload": data,
    ]
  }
}

/// Bridges Flutter's `mobile/watch_companion` MethodChannel to Apple WatchConnectivity.
final class WatchCompanionPlugin: NSObject, FlutterPlugin, WCSessionDelegate {
  private let channel: FlutterMethodChannel
  private var latestContext: [String: Any]?

  private init(channel: FlutterMethodChannel) {
    self.channel = channel
    super.init()
  }

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "mobile/watch_companion",
      binaryMessenger: registrar.messenger()
    )
    let instance = WatchCompanionPlugin(channel: channel)
    registrar.addMethodCallDelegate(instance, channel: channel)
    instance.activateSessionIfSupported()
  }

  private func activateSessionIfSupported() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "isSupported":
      result(WCSession.isSupported())
    case "syncContext":
      guard let json = call.arguments as? String,
            let wire = WatchCompanionWire.makeApplicationContext(jsonPayload: json) else {
        result(FlutterError(code: "invalid_payload", message: "Invalid watch payload", details: nil))
        return
      }
      latestContext = wire
      pushApplicationContext(wire)
      result(true)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  private func pushApplicationContext(_ wire: [String: Any]) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    if session.activationState != .activated {
      session.activate()
      return
    }
    guard session.isPaired, session.isWatchAppInstalled else { return }
    try? session.updateApplicationContext(wire)
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    guard activationState == .activated, error == nil, let latestContext else { return }
    pushApplicationContext(latestContext)
  }

  func sessionWatchStateDidChange(_ session: WCSession) {
    guard session.activationState == .activated,
          session.isPaired,
          session.isWatchAppInstalled,
          let latestContext else { return }
    pushApplicationContext(latestContext)
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    guard (message["action"] as? String) == "refreshSession" else {
      replyHandler([:])
      return
    }

    DispatchQueue.main.async { [weak self] in
      guard let self else {
        replyHandler([:])
        return
      }
      self.channel.invokeMethod("refreshSession", arguments: nil) { response in
        if let json = response as? String,
           let wire = WatchCompanionWire.makeApplicationContext(jsonPayload: json) {
          self.latestContext = wire
          replyHandler(wire)
        } else if let fallback = self.latestContext {
          replyHandler(fallback)
        } else {
          replyHandler([:])
        }
      }
    }
  }
}
