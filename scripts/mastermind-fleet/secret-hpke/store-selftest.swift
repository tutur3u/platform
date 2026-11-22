import Foundation
import Security

// Self-test of the phone's secret-entry Keychain store
// (apps/mobile/ios/Runner/MastermindSecretStore.swift) against a stand-in
// Keychain that can refuse any call: a write updates in place, adds only a
// missing item and never deletes; a refused update leaves the old value and
// throws; a refused read throws and is never taken for "no item". A round
// trip through the host's real Keychain runs when one is usable. Built and
// run by build.sh.

/// A Keychain in memory, with the next refusal of each call set by the test.
final class FakeKeychain: MastermindKeychainCalls {
  var items: [String: [String: Any]] = [:]
  var calls: [String] = []
  var refuseUpdate: OSStatus?
  /// Refuses only updates of an item that exists, so a first update still
  /// reports a missing item.
  var refuseUpdateOfExisting: OSStatus?
  var refuseAdd: OSStatus?
  var refuseDelete: OSStatus?
  var refuseRead: OSStatus?
  /// The next add loses to another writer, which stores this value first.
  var rivalValue: String?

  private func id(_ query: [String: Any]) -> String? {
    guard let service = query[kSecAttrService as String] as? String,
      let account = query[kSecAttrAccount as String] as? String
    else { return nil }
    return service + "|" + account
  }

  func update(_ query: [String: Any], _ changes: [String: Any]) -> OSStatus {
    calls.append("update")
    if let refuseUpdate { return refuseUpdate }
    guard let key = id(query), var item = items[key] else { return errSecItemNotFound }
    if let refuseUpdateOfExisting { return refuseUpdateOfExisting }
    item[kSecValueData as String] = changes[kSecValueData as String]
    items[key] = item
    return errSecSuccess
  }

  func add(_ item: [String: Any]) -> OSStatus {
    calls.append("add")
    guard let key = id(item) else { return errSecParam }
    if let rivalValue {
      self.rivalValue = nil
      var rival = item
      rival[kSecValueData as String] = Data(rivalValue.utf8)
      items[key] = rival
      return errSecDuplicateItem
    }
    if let refuseAdd { return refuseAdd }
    if items[key] != nil { return errSecDuplicateItem }
    items[key] = item
    return errSecSuccess
  }

  func delete(_ query: [String: Any]) -> OSStatus {
    calls.append("delete")
    if let refuseDelete { return refuseDelete }
    guard let key = id(query) else { return errSecParam }
    return items.removeValue(forKey: key) == nil ? errSecItemNotFound : errSecSuccess
  }

  func copyMatching(_ query: [String: Any]) -> (OSStatus, AnyObject?) {
    calls.append("copy")
    if let refuseRead { return (refuseRead, nil) }
    if let key = id(query) {
      guard let item = items[key] else { return (errSecItemNotFound, nil) }
      return (errSecSuccess, item[kSecValueData as String] as AnyObject?)
    }
    // As documented for password items: no data with a match-all limit.
    if query[kSecReturnData as String] != nil { return (errSecParam, nil) }
    let service = query[kSecAttrService as String] as? String
    let rows = items.values
      .filter { $0[kSecAttrService as String] as? String == service }
      .map { $0.filter { $0.key != (kSecValueData as String) } }
    return rows.isEmpty ? (errSecItemNotFound, nil) : (errSecSuccess, rows as AnyObject)
  }
}

struct StoreSelfTest {
  var passed = 0
  var failed: [String] = []

  mutating func check(_ name: String, _ condition: Bool) {
    if condition { passed += 1 } else { failed.append(name) }
  }

  /// `body` must throw the store's failure carrying `status`.
  mutating func refuses(_ name: String, _ status: OSStatus, _ body: () throws -> Void) {
    do {
      try body()
      failed.append(name)
    } catch let error as MastermindSecretStore.Failure {
      check(name, error.status == status)
    } catch {
      failed.append(name)
    }
  }
}

@main
struct Main {
  static func main() {
    var t = StoreSelfTest()
    let service = MastermindSecretStore.service
    t.check("service name", service == "tuturuuu.mastermind-secret")

    // A new key is added once, in the unlocked-only class, never synced.
    var fake = FakeKeychain()
    var store = MastermindSecretStore(keychain: fake)
    do {
      t.check("missing reads nil", try store.read("pins") == nil)
      try store.write("pins", "one")
      t.check("new key: update then add", fake.calls == ["copy", "update", "add"])
      let item = fake.items[service + "|pins"] ?? [:]
      t.check(
        "added unlocked-only",
        (item[kSecAttrAccessible as String] as? String)
          == (kSecAttrAccessibleWhenUnlockedThisDeviceOnly as String))
      t.check("added not synced", (item[kSecAttrSynchronizable as String] as? Bool) == false)
      t.check(
        "added as generic password",
        (item[kSecClass as String] as? String) == (kSecClassGenericPassword as String))
      t.check("reads back", try store.read("pins") == "one")

      // An existing key is updated in place: no add, no delete.
      fake.calls = []
      try store.write("pins", "two")
      t.check("existing key: update only", fake.calls == ["update"])
      t.check("updated value", try store.read("pins") == "two")
    } catch {
      t.failed.append("round trip threw")
    }

    // A refused update keeps the old item and throws that status.
    let refusals: [OSStatus] = [
      errSecInteractionNotAllowed, errSecAuthFailed, errSecNotAvailable, errSecIO, errSecParam,
      errSecDuplicateItem,
    ]
    for status in refusals {
      fake.calls = []
      fake.refuseUpdate = status
      t.refuses("refused update \(status) throws", status) { try store.write("pins", "three") }
      fake.refuseUpdate = nil
      t.check("refused update \(status) never deletes", !fake.calls.contains("delete"))
      t.check("refused update \(status) never adds", !fake.calls.contains("add"))
      t.check("refused update \(status) keeps old", (try? store.read("pins")) == "two")
    }

    // A refused add of a new key stores nothing and deletes nothing.
    fake.calls = []
    fake.refuseAdd = errSecInteractionNotAllowed
    t.refuses("refused add throws", errSecInteractionNotAllowed) { try store.write("counts", "x") }
    fake.refuseAdd = nil
    t.check("refused add stores nothing", (try? store.read("counts")) == .some(nil))
    t.check("refused add never deletes", !fake.calls.contains("delete"))
    t.check("refused add leaves others", (try? store.read("pins")) == "two")

    // Losing the add to another writer changes that item in place.
    fake.calls = []
    fake.rivalValue = "rival"
    do {
      try store.write("counts", "mine")
      t.check("rival add: update, add, update", fake.calls == ["update", "add", "update"])
      t.check("rival add: ours wins", try store.read("counts") == "mine")
    } catch {
      t.failed.append("rival add threw")
    }
    // The same race with the follow-up update refused keeps the rival's item.
    fake = FakeKeychain()
    store = MastermindSecretStore(keychain: fake)
    fake.rivalValue = "rival"
    fake.refuseUpdateOfExisting = errSecInteractionNotAllowed
    t.refuses("refused rival update throws", errSecInteractionNotAllowed) {
      try store.write("pins", "mine")
    }
    fake.refuseUpdateOfExisting = nil
    t.check("refused rival update keeps rival", (try? store.read("pins")) == "rival")
    t.check("refused rival update never deletes", !fake.calls.contains("delete"))
    do { try store.write("pins", "base") } catch { t.failed.append("write after race threw") }

    // A refused read throws: it is never "no item".
    fake.refuseRead = errSecInteractionNotAllowed
    t.refuses("refused read throws", errSecInteractionNotAllowed) { _ = try store.read("pins") }
    t.refuses("refused list throws", errSecInteractionNotAllowed) { _ = try store.readAll() }
    t.refuses("refused names throw", errSecInteractionNotAllowed) { _ = try store.keys() }
    fake.refuseRead = nil

    // A value that is not UTF-8 text is a failure, not an empty answer.
    fake.items[service + "|bad"] = [
      kSecAttrService as String: service, kSecAttrAccount as String: "bad",
      kSecValueData as String: Data([0xFF, 0xFE]),
    ]
    t.refuses("undecodable read throws", errSecDecode) { _ = try store.read("bad") }
    t.refuses("undecodable list throws", errSecDecode) { _ = try store.readAll() }
    // The names still list, so an erase can remove an item it cannot read.
    t.check("names list past an unreadable value", (try? store.keys().sorted()) == ["bad", "pins"])
    do {
      try store.delete("bad")
      t.check("unreadable item deleted by name", try store.keys() == ["pins"])
    } catch {
      t.failed.append("delete of unreadable item threw")
    }

    // Listing covers this service only; delete tolerates a missing item.
    fake.items["other.service|pins"] = [
      kSecAttrService as String: "other.service", kSecAttrAccount as String: "pins",
      kSecValueData as String: Data("foreign".utf8),
    ]
    do {
      try store.write("counts", "5")
      t.check("lists this service", try store.readAll() == ["pins": "base", "counts": "5"])
      t.check("names this service", try store.keys().sorted() == ["counts", "pins"])
      try store.delete("counts")
      t.check("deleted", try store.read("counts") == nil)
      try store.delete("counts")
      t.check("foreign item untouched", fake.items["other.service|pins"] != nil)
      try store.delete("pins")
      t.check("empty lists nothing", try store.readAll() == [:])
      t.check("empty names nothing", try store.keys() == [])
    } catch {
      t.failed.append("list and delete threw")
    }
    do { try store.write("pins", "kept") } catch {}
    fake.refuseDelete = errSecInteractionNotAllowed
    t.refuses("refused delete throws", errSecInteractionNotAllowed) { try store.delete("pins") }
    fake.refuseDelete = nil
    t.check("refused delete keeps item", (try? store.read("pins")) == "kept")

    // The host's real Keychain, when one is usable from this process.
    let real = MastermindSecretStore()
    let run = "selftest-" + UUID().uuidString
    let names = [run + "-a", run + "-b", run + "-c"]
    do {
      for name in names { try real.write(name, "one " + name) }
      try real.write(names[0], "two")
      t.check("real Keychain update in place", try real.read(names[0]) == "two")
      let listed = try real.keys().filter { $0.hasPrefix(run) }.sorted()
      t.check("real Keychain names several items", listed == names)
      let all = try real.readAll().filter { $0.key.hasPrefix(run) }
      t.check(
        "real Keychain reads several items",
        all == [names[0]: "two", names[1]: "one " + names[1], names[2]: "one " + names[2]])
      for name in names { try real.delete(name) }
      t.check("real Keychain delete", try real.keys().filter { $0.hasPrefix(run) }.isEmpty)
      print("store selftest: real Keychain exercised")
    } catch let error as MastermindSecretStore.Failure {
      for name in names { try? real.delete(name) }
      print("store selftest: real Keychain skipped (status \(error.status))")
    } catch {
      t.failed.append("real Keychain threw")
    }

    if t.failed.isEmpty {
      print("store selftest: \(t.passed) passed")
    } else {
      print(
        "store selftest: \(t.passed) passed, \(t.failed.count) failed: \(t.failed.joined(separator: ", "))"
      )
      exit(1)
    }
  }
}
