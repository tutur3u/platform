import Foundation
import SwiftUI
import TuturuuuWatchKit
import WatchKit
import WidgetKit

@MainActor
final class WatchAppViewModel: ObservableObject {
  @Published private(set) var isSignedIn: Bool = false
  @Published private(set) var metadata: WatchSessionMetadata?
  @Published private(set) var snapshot: WatchTodaySnapshot?
  @Published private(set) var isLoading: Bool = false
  @Published private(set) var isSyncingPhone: Bool = false
  @Published private(set) var statusMessage: String?
  @Published private(set) var completingTaskIds: Set<String> = []

  @Published var miraConversationId: String?
  @Published var miraLastPrompt: String?
  @Published var miraReply: String = ""
  @Published var isAskingMira: Bool = false
  @Published var miraError: String?

  private let secretStore: WatchSecretStore
  private let snapshotStore: WatchSnapshotStoring
  private var connectivity: WatchConnectivityManager?
  private var apiClient: WatchAPIClient!

  init(
    secretStore: WatchSecretStore = WatchKeychainStore(),
    snapshotStore: WatchSnapshotStoring? = nil,
    activateConnectivity: Bool = true
  ) {
    self.secretStore = secretStore
    let groupId = Bundle.main.object(forInfoDictionaryKey: "WatchAppGroupIdentifier") as? String
    self.snapshotStore = snapshotStore ?? AppGroupWatchSnapshotStore(appGroupIdentifier: groupId)

    let coordinator = WatchSessionCoordinator(
      secretStore: self.secretStore,
      snapshotStore: self.snapshotStore
    )
    let manager = WatchConnectivityManager(coordinator: coordinator) { [weak self] in
      Task { @MainActor in
        self?.reloadFromLocalStores()
        await self?.refreshToday()
      }
    }
    self.connectivity = activateConnectivity ? manager : nil
    self.apiClient = WatchAPIClient(
      secretStore: self.secretStore,
      onUnauthorizedRefresh: { [weak manager] in
        await manager?.requestSessionRefreshFromPhone()
      }
    )

    reloadFromLocalStores()
    if activateConnectivity {
      manager.activate()
    }
  }

  static func preview(
    metadata: WatchSessionMetadata?,
    snapshot: WatchTodaySnapshot?,
    miraLastPrompt: String? = nil,
    miraReply: String = ""
  ) -> WatchAppViewModel {
    let secrets = InMemoryWatchSecretStore()
    let store = InMemoryWatchSnapshotStore()
    if let metadata {
      try? secrets.saveAccessToken("preview-session-token")
      try? store.saveMetadata(metadata)
    }
    if let snapshot {
      try? store.saveSnapshot(snapshot)
    }
    let model = WatchAppViewModel(
      secretStore: secrets,
      snapshotStore: store,
      activateConnectivity: false
    )
    model.miraLastPrompt = miraLastPrompt
    model.miraReply = miraReply
    return model
  }

  var locale: WatchLocale {
    metadata?.locale ?? .systemDefault
  }

  var calmColors: Bool {
    metadata?.calmColors ?? false
  }

  func text(_ key: WatchStringKey) -> String {
    WatchStrings.text(key, locale: locale)
  }

  func reloadFromLocalStores() {
    let loadedMetadata = snapshotStore.readMetadata()
    let hasToken = (secretStore.readAccessToken()?.isEmpty == false)
    metadata = loadedMetadata
    snapshot = snapshotStore.readSnapshot()
    isSignedIn = hasToken && loadedMetadata != nil
  }

  func syncFromPhone() async {
    isSyncingPhone = true
    defer { isSyncingPhone = false }
    _ = await connectivity?.requestSessionRefreshFromPhone()
    reloadFromLocalStores()
    if isSignedIn {
      await refreshToday()
    }
  }

  func refreshToday() async {
    guard let metadata, isSignedIn else { return }
    if metadata.isTokenExpired(now: Date()) {
      _ = await connectivity?.requestSessionRefreshFromPhone()
      reloadFromLocalStores()
    }
    guard let activeMetadata = self.metadata, isSignedIn else { return }

    isLoading = true
    statusMessage = nil
    defer { isLoading = false }

    do {
      let fresh = try await apiClient.fetchTodaySnapshot(metadata: activeMetadata)
      snapshot = fresh
      try? snapshotStore.saveSnapshot(fresh)
      WidgetCenter.shared.reloadAllTimelines()
    } catch WatchAPIError.unauthorized {
      statusMessage = text(.signedOutTitle)
    } catch {
      if snapshot == nil {
        statusMessage = text(.taskCompleteFailed)
      }
    }
  }

  func markTaskDone(_ task: WatchTaskItem) async {
    guard let metadata, isSignedIn, !completingTaskIds.contains(task.id) else { return }
    let previousSnapshot = snapshot
    completingTaskIds.insert(task.id)
    defer { completingTaskIds.remove(task.id) }

    if let current = snapshot {
      let updatedTasks = current.tasks.map { item in
        item.id == task.id ? item.markingCompleted(true) : item
      }
      let optimistic = WatchTodaySnapshot(
        workspaceId: current.workspaceId,
        workspaceName: current.workspaceName,
        isPersonal: current.isPersonal,
        syncedAt: Date(),
        events: current.events,
        tasks: updatedTasks
      )
      snapshot = optimistic
      try? snapshotStore.saveSnapshot(optimistic)
      WidgetCenter.shared.reloadAllTimelines()
    }

    do {
      try await apiClient.markTaskCompleted(task: task, metadata: metadata)
      WKInterfaceDevice.current().play(.success)
      statusMessage = text(.taskCompleted)
    } catch {
      snapshot = previousSnapshot
      if let previousSnapshot {
        try? snapshotStore.saveSnapshot(previousSnapshot)
        WidgetCenter.shared.reloadAllTimelines()
      }
      WKInterfaceDevice.current().play(.failure)
      statusMessage = text(.taskCompleteFailed)
    }
  }

  func quickCaptureTask(title: String, priority: WatchTaskPriority) async -> Bool {
    guard let metadata, isSignedIn else { return false }
    do {
      let created = try await apiClient.quickCaptureTask(
        name: title,
        priority: priority,
        dueToday: true,
        metadata: metadata
      )
      if let current = snapshot {
        let updated = WatchTodaySnapshot(
          workspaceId: current.workspaceId,
          workspaceName: current.workspaceName,
          isPersonal: current.isPersonal,
          syncedAt: Date(),
          events: current.events,
          tasks: [created] + current.tasks
        )
        snapshot = updated
        try? snapshotStore.saveSnapshot(updated)
      }
      WidgetCenter.shared.reloadAllTimelines()
      WKInterfaceDevice.current().play(.success)
      statusMessage = text(.quickCaptureSaved)
      return true
    } catch {
      WKInterfaceDevice.current().play(.failure)
      statusMessage = text(.quickCaptureFailed)
      return false
    }
  }

  func askMira(prompt: String, startNewConversation: Bool = false) async {
    guard let metadata, isSignedIn else { return }
    let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }

    if startNewConversation {
      miraConversationId = nil
    }
    miraLastPrompt = trimmed
    miraReply = ""
    miraError = nil
    isAskingMira = true
    defer { isAskingMira = false }

    do {
      let result = try await apiClient.askMira(
        prompt: trimmed,
        conversationId: miraConversationId,
        metadata: metadata,
        onDelta: { [weak self] partial in
          Task { @MainActor in
            self?.miraReply = partial
          }
        }
      )
      miraConversationId = result.conversationId
      miraReply = result.reply
      WKInterfaceDevice.current().play(.success)
    } catch {
      miraError = text(.miraError)
      WKInterfaceDevice.current().play(.failure)
    }
  }
}
