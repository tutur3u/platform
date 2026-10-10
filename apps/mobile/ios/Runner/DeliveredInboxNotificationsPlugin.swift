import Flutter
import Foundation
import UserNotifications

/// Delivered-only API. No pending notification or schedule cancellation.
final class DeliveredInboxNotificationsPlugin: NSObject, FlutterPlugin {
  private struct Record {
    let identifier: String
    let date: Date
    let capsule: String
  }
  private struct Snapshot {
    let actor: String
    let epoch: UInt64
    let records: [Record]
  }
  private struct Identity {
    let actor: String
    let workspace: String?
    let id: String
  }
  private var actor: String?
  private var epoch: UInt64 = 0
  private var snapshots: [String: Snapshot] = [:]
  private let center = UNUserNotificationCenter.current()
  private let prefix = "tuturuuu:inbox:v1:"

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "mobile/delivered_inbox_notifications", binaryMessenger: registrar.messenger())
    registrar.addMethodCallDelegate(DeliveredInboxNotificationsPlugin(), channel: channel)
  }

  private func isUUID(_ value: String) -> Bool {
    value.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                options: .regularExpression) != nil
  }

  private func fail(_ result: FlutterResult) {
    result(FlutterError(code: "unavailable",
                        message: "Delivered notification operation unavailable", details: nil))
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any] ?? [:]
    if call.method == "bindSession" {
      epoch &+= 1
      snapshots.removeAll()
      actor = nil
      if let next = args["actor"] as? String {
        guard isUUID(next) else { fail(result); return }
        actor = next
      } else if let supplied = args["actor"], !(supplied is NSNull) {
        fail(result); return
      }
      result(true)
      return
    }
    guard let owner = args["actor"] as? String, owner == actor, isUUID(owner) else {
      fail(result); return
    }
    let capturedEpoch = epoch
    switch call.method {
    case "snapshot": snapshot(args, owner: owner, epoch: capturedEpoch, result: result)
    case "dismissSnapshot": dismiss(args, owner: owner, epoch: capturedEpoch, result: result)
    case "discardSnapshot":
      guard let token = args["token"] as? String, let snapshot = snapshots[token],
            snapshot.actor == owner, snapshot.epoch == capturedEpoch else { fail(result); return }
      snapshots.removeValue(forKey: token)
      result(true)
    default: result(FlutterMethodNotImplemented)
    }
  }

  private func identity(_ capsule: String) -> Identity? {
    guard capsule.utf8.count <= 256, capsule.hasPrefix(prefix) else { return nil }
    let encoded = String(capsule.dropFirst(prefix.count))
    var base64 = encoded.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    guard let data = Data(base64Encoded: base64),
          data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") == encoded,
          let tuple = try? JSONSerialization.jsonObject(with: data) as? [Any],
          tuple.count == 3, let owner = tuple[0] as? String, let id = tuple[2] as? String,
          isUUID(owner), isUUID(id) else { return nil }
    let workspace: String?
    if tuple[1] is NSNull { workspace = nil }
    else if let ws = tuple[1] as? String, isUUID(ws) { workspace = ws }
    else { return nil }
    guard let canonical = try? JSONSerialization.data(withJSONObject: tuple), canonical == data else {
      return nil
    }
    return Identity(actor: owner, workspace: workspace, id: id)
  }

  private func capsule(_ notification: UNNotification) -> String? {
    let info = notification.request.content.userInfo
    if let direct = info["inboxIdentity"] as? String { return direct }
    guard let payload = info["payload"] as? String, payload.utf8.count <= 16384,
          let data = payload.data(using: .utf8),
          let decoded = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return nil
    }
    return decoded["inboxIdentity"] as? String
  }

  private func snapshot(_ args: [String: Any], owner: String, epoch: UInt64,
                        result: @escaping FlutterResult) {
    let scope = args["scope"] as? String
    let ws = args["workspaceId"] as? String
    let id = args["notificationId"] as? String
    for key in ["workspaceId", "notificationId"] {
      if let supplied = args[key], !(supplied is NSNull), !(supplied is String) {
        fail(result); return
      }
    }
    guard snapshots.count < 8,
          (scope == "allActor" && ws == nil) ||
            (scope == "exactWorkspace" && ws != nil && isUUID(ws!)),
          id == nil || isUUID(id!) else { fail(result); return }
    center.getDeliveredNotifications { [weak self] delivered in
      DispatchQueue.main.async {
        guard let self, self.actor == owner, self.epoch == epoch,
              delivered.count <= 512, self.snapshots.count < 8 else {
          result(FlutterError(code: "unavailable", message: "Delivered notification operation unavailable", details: nil))
          return
        }
        let records = delivered.compactMap { item -> Record? in
          guard let capsule = self.capsule(item), let identity = self.identity(capsule),
                identity.actor == owner,
                scope != "exactWorkspace" || identity.workspace == ws,
                id == nil || identity.id == id else { return nil }
          return Record(identifier: item.request.identifier, date: item.date, capsule: capsule)
        }
        let token = UUID().uuidString
        self.snapshots[token] = Snapshot(actor: owner, epoch: epoch, records: records)
        result(["token": token, "count": records.count])
      }
    }
  }

  private func dismiss(_ args: [String: Any], owner: String, epoch: UInt64,
                       result: @escaping FlutterResult) {
    guard let token = args["token"] as? String,
          let snapshot = snapshots.removeValue(forKey: token),
          snapshot.actor == owner, snapshot.epoch == epoch else { fail(result); return }
    center.getDeliveredNotifications { [weak self] delivered in
      DispatchQueue.main.async {
        guard let self, self.actor == owner, self.epoch == epoch, delivered.count <= 512 else {
          result(FlutterError(code: "unavailable", message: "Delivered notification operation unavailable", details: nil))
          return
        }
        let identifiers = snapshot.records.compactMap { record -> String? in
          guard delivered.contains(where: {
            $0.request.identifier == record.identifier && $0.date == record.date &&
              self.capsule($0) == record.capsule
          }) else { return nil }
          return record.identifier
        }
        // No platform atomic timestamp-conditioned removal; this is a bounded recheck.
        self.center.removeDeliveredNotifications(withIdentifiers: identifiers)
        result(identifiers.count)
      }
    }
  }
}
