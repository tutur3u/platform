import {
  type DevboxExecutionMode,
  protectedSystemdSettings,
} from './devbox-host-protection';
export type DevboxServiceManager = 'auto' | 'launchd' | 'systemd';

// One host can run several runner identities (for example an isolated Judge
// runner beside a trusted one). A service name keeps each identity's unit,
// label, token and wrapper distinct; no name keeps the legacy single-runner
// paths so existing installations and `repair` are unchanged.
export function devboxServiceNames(serviceName?: string) {
  if (
    serviceName !== undefined &&
    !/^[a-z0-9][a-z0-9-]{0,39}$/u.test(serviceName)
  )
    throw new Error(
      '--service-name must be 1-40 lowercase letters, digits, or hyphens.'
    );
  const suffix = serviceName ? `-${serviceName}` : '';
  return {
    systemdUnit: `tuturuuu-devbox-runner${suffix}.service`,
    launchdLabel: serviceName
      ? `com.tuturuuu.devbox-runner.${serviceName}`
      : 'com.tuturuuu.devbox-runner',
    tokenFile: `devbox-runner${suffix}.env`,
    wrapperFile: `devbox-runner${suffix}.sh`,
    logBase: `tuturuuu-devbox-runner${suffix}`,
  };
}

export function getServiceDefinitionPath(
  manager: Exclude<DevboxServiceManager, 'auto'>,
  serviceName?: string
) {
  const names = devboxServiceNames(serviceName);
  return manager === 'systemd'
    ? `/etc/systemd/system/${names.systemdUnit}`
    : `/Library/LaunchDaemons/${names.launchdLabel}.plist`;
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
  executionMode = 'trusted',
  serviceHome,
  serviceUser,
  wrapperPath,
}: {
  checkoutDir: string;
  executionMode?: DevboxExecutionMode;
  serviceHome?: string;
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
    // Stop signals the agent only; it drains active jobs before exiting.
    // Remaining processes are killed when TimeoutStopSec elapses.
    'KillMode=mixed',
    'TimeoutStopSec=600',
    'NoNewPrivileges=yes',
    'UMask=0077',
    ...(serviceHome ? [`Environment=HOME=${serviceHome}`] : []),
    ...(executionMode === 'judge-only'
      ? protectedSystemdSettings(
          checkoutDir,
          wrapperPath,
          serviceHome ?? checkoutDir
        )
      : []),
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    '',
  ].join('\n');
}

export function renderLaunchdPlist({
  checkoutDir,
  serviceName,
  serviceUser,
  wrapperPath,
}: {
  checkoutDir: string;
  serviceName?: string;
  serviceUser: string;
  wrapperPath: string;
}) {
  const names = devboxServiceNames(serviceName);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(names.launchdLabel)}</string>
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
  <key>ExitTimeOut</key>
  <integer>600</integer>
  <key>StandardOutPath</key>
  <string>/var/log/${xmlEscape(names.logBase)}.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/${xmlEscape(names.logBase)}.err.log</string>
</dict>
</plist>
`;
}
