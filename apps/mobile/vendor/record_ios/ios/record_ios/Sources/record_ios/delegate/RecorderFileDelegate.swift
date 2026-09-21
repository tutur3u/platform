import AVFoundation
import Foundation

class RecorderFileDelegate: NSObject, AudioRecordingFileDelegate, AVAudioRecorderDelegate {
  var config: RecordConfig?

  private var m_audioRecorder: AVAudioRecorder?
  private var m_path: String?
  private var m_stoppingIntentionally = false
  private var m_interruptionObserver: NSObjectProtocol?
  private let m_queue: DispatchQueue
  private var m_onRecord: () -> ()
  private var m_onPause: () -> ()
  private var m_onStop: () -> ()
  private let m_manageAudioSession: Bool

  init(queue: DispatchQueue, manageAudioSession: Bool, onRecord: @escaping () -> (), onPause: @escaping () -> (), onStop: @escaping () -> ()) {
    m_queue = queue
    m_manageAudioSession = manageAudioSession
    m_onRecord = onRecord
    m_onPause = onPause
    m_onStop = onStop
  }

  func start(config: RecordConfig, path: String) throws {
    try deleteFile(path: path)

    m_interruptionObserver = try initAVAudioSession(config: config, manageAudioSession: m_manageAudioSession, queue: m_queue)

    let url = URL(fileURLWithPath: path)
    let recorder = try AVAudioRecorder(url: url, settings: getOutputSettings(config: config))

    recorder.delegate = self
    recorder.isMeteringEnabled = true
    recorder.prepareToRecord()
    recorder.record()

    m_audioRecorder = recorder
    m_path = path
    self.config = config

    m_onRecord()
  }

  func stop() -> String? {
    let path = teardown()
    m_onStop()
    return path
  }

  func pause() {
    guard let recorder = m_audioRecorder, recorder.isRecording else { return }
    recorder.pause()
    m_onPause()
  }

  func resume() throws {
    guard let recorder = m_audioRecorder else { return }
    recorder.record()
    m_onRecord()
  }

  func cancel() throws {
    guard let path = m_path else { return }
    _ = teardown()
    try deleteFile(path: path)
  }

  func getAmplitude() -> Float {
    m_audioRecorder?.updateMeters()
    return m_audioRecorder?.averagePower(forChannel: 0) ?? -160
  }

  func dispose() {
    _ = stop()
  }

  func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    // Dispatches to m_queue so it is serialized with stop() calls from the plugin.
    m_queue.async {
      if self.m_stoppingIntentionally {
        self.m_stoppingIntentionally = false
        return
      }
      // System-terminated recording (disk full, audio route loss, etc.) — clean up state.
      _ = self.stop()
    }
  }

  @discardableResult
  private func teardown() -> String? {
    if let observer = m_interruptionObserver {
      NotificationCenter.default.removeObserver(observer)
      m_interruptionObserver = nil
    }
    m_stoppingIntentionally = true
    m_audioRecorder?.stop()
    m_audioRecorder = nil
    let path = m_path
    m_path = nil
    config = nil
    return path
  }

  private func deleteFile(path: String) throws {
    let fileManager = FileManager.default
    guard fileManager.fileExists(atPath: path) else { return }
    do {
      try fileManager.removeItem(atPath: path)
    } catch {
      throw RecorderError.error(message: "Failed to delete previous recording", details: error.localizedDescription)
    }
  }
}
