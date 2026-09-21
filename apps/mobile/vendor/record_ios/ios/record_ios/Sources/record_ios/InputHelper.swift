import AVFoundation

func listInputs() throws -> [Device] {
  var devices: [Device] = []

  try listInputDevices()?.forEach { input in
    devices.append(Device(
      id: input.uid,
      label: input.portName,
      type: portTypeToInputDeviceType(input.portType)
    ))
  }

  return devices
}

func portTypeToInputDeviceType(_ portType: AVAudioSession.Port) -> String {
  if portType == .builtInMic  { return "builtIn" }
  if portType == .headsetMic  { return "wiredHeadset" }
  if portType == .lineIn      { return "lineIn" }
  if portType == .bluetoothHFP { return "bluetoothSco" }
  if portType == .bluetoothA2DP { return "bluetoothA2dp" }
  if portType == .bluetoothLE { return "bluetoothLe" }
  if portType == .usbAudio    { return "usb" }
  if portType == .HDMI        { return "hdmi" }
  if portType == .airPlay     { return "airPlay" }
  if #available(iOS 14.0, *) {
    if portType == .thunderbolt { return "thunderbolt" }
  }
  return "unknown"
}

func listInputDevices() throws -> [AVAudioSessionPortDescription]? {
  let audioSession = AVAudioSession.sharedInstance()

  let inputCapableCategories: [AVAudioSession.Category] = [.record, .playAndRecord]
  if !inputCapableCategories.contains(audioSession.category) {
    do {
      try audioSession.setCategory(.playAndRecord, options: [.defaultToSpeaker, .allowBluetooth])
    } catch {
      throw RecorderError.error(message: "Failed to list inputs", details: "setCategory: \(error.localizedDescription)")
    }
  }

  return audioSession.availableInputs
}
