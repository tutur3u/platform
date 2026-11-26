import Foundation
import TuturuuuWatchKit
import WatchConnectivity
import WidgetKit

/// Bridges WatchConnectivity updates from the paired iPhone into Keychain + App Group storage
/// and supports on-demand session refresh when the watch's short-lived token expires.
final class WatchConnectivityManager: NSObject, WCSessionDelegate, @unchecked Sendable {
  private let coordinator: WatchSessionCoordinator
  private let onContextApplied: @Sendable () -> Void

  init(
    coordinator: WatchSessionCoordinator,
    onContextApplied: @escaping @Sendable () -> Void
  ) {
    self.coordinator = coordinator
    self.onContextApplied = onContextApplied
    super.init()
  }

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func requestSessionRefreshFromPhone() async -> String? {
    guard WCSession.isSupported() else { return nil }
    let session = WCSession.default
    guard session.activationState == .activated, session.isReachable else {
      return nil
    }
    return await withCheckedContinuation { continuation in
      session.sendMessage(
        ["action": "refreshSession"],
        replyHandler: { [weak self] reply in
          guard let self else {
            continuation.resume(returning: nil)
            return
          }
          self.applyIncomingDictionary(reply)
          continuation.resume(returning: self.coordinator.secretStore.readAccessToken())
        },
        errorHandler: { _ in
          continuation.resume(returning: nil)
        }
      )
    }
  }

  private func applyIncomingDictionary(_ dictionary: [String: Any]) {
    guard !dictionary.isEmpty,
          let context = try? WatchSessionContext.fromWatchConnectivityDictionary(dictionary) else {
      return
    }
    _ = try? coordinator.apply(context)
    WidgetCenter.shared.reloadAllTimelines()
    onContextApplied()
  }

  // MARK: - WCSessionDelegate

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    guard activationState == .activated, error == nil else { return }
    applyIncomingDictionary(session.receivedApplicationContext)
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    applyIncomingDictionary(applicationContext)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    applyIncomingDictionary(userInfo)
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    applyIncomingDictionary(message)
    replyHandler(["ok": true])
  }
}
