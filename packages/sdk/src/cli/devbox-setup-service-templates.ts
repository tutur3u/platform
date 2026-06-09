export type DevboxServiceManager = 'auto' | 'launchd' | 'systemd';

export function getServiceDefinitionPath(
  manager: Exclude<DevboxServiceManager, 'auto'>
) {
  return manager === 'systemd'
    ? '/etc/systemd/system/tuturuuu-devbox-runner.service'
    : '/Library/LaunchDaemons/com.tuturuuu.devbox-runner.plist';
}

function xmlEscape(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

export function renderSystemdUnit({
  checkoutDir,
  serviceUser,
  wrapperPath,
}: {
  checkoutDir: string;
  serviceUser: string;
  wrapperPath: string;
}) {
  return [
    '[Unit]',
    'Description=Tuturuuu Devbox Runner',
    'After=network-online.target docker.service',
    'Wants=network-online.target docker.service',
    '',
    '[Service]',
    'Type=simple',
    `User=${serviceUser}`,
    `WorkingDirectory=${checkoutDir}`,
    `ExecStart=${wrapperPath}`,
    'Restart=always',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
}

export function renderLaunchdPlist({
  checkoutDir,
  serviceUser,
  wrapperPath,
}: {
  checkoutDir: string;
  serviceUser: string;
  wrapperPath: string;
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.tuturuuu.devbox-runner</string>
  <key>UserName</key>
  <string>${xmlEscape(serviceUser)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(checkoutDir)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>${xmlEscape(wrapperPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/var/log/tuturuuu-devbox-runner.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/tuturuuu-devbox-runner.err.log</string>
</dict>
</plist>
`;
}
