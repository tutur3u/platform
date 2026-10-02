export const networkPolicy = Object.freeze({
  slice: 'tuturuuu-typegen.slice',
  cgroupPath: '/sys/fs/cgroup/tuturuuu.slice/tuturuuu-typegen.slice',
  containerPool: '172.28.0.0/16',
  dns: ['127.0.0.1'],
});
export function assertNetworkPolicy({ daemon, programs, allow, deny }) {
  if (
    daemon['cgroup-parent'] !== networkPolicy.slice ||
    JSON.stringify(daemon['default-address-pools']) !==
      JSON.stringify([{ base: networkPolicy.containerPool, size: 24 }]) ||
    JSON.stringify(daemon.dns) !== JSON.stringify(networkPolicy.dns) ||
    daemon.ipv6 !== false
  ) {
    console.warn('Programming policy mismatch=daemon');
    throw new Error('Disposable Docker network policy mismatch');
  }
  const allowed = allow.trim().split(/\s+/).sort();
  if (
    JSON.stringify(allowed) !==
      JSON.stringify(['127.0.0.0/8', '172.28.0.0/16', '::1/128'].sort()) ||
    JSON.stringify(deny.trim().split(/\s+/).sort()) !==
      JSON.stringify(['0.0.0.0/0', '::/0'].sort())
  ) {
    console.warn('Programming policy mismatch=addresses');
    throw new Error('Slice IP allow/deny policy mismatch');
  }
  const types = new Set(programs.map((program) => program.attach_type));
  if (
    !(types.has('ingress') || types.has('cgroup_inet_ingress')) ||
    !(types.has('egress') || types.has('cgroup_inet_egress'))
  ) {
    console.warn('Programming policy mismatch=kernel');
    throw new Error('Kernel IP filters missing; refusing lifecycle');
  }
}
export const firewallRules = [
  '-N TTR-TYPEGEN-EGRESS',
  '-A TTR-TYPEGEN-EGRESS -i br+ -o br+ -m physdev --physdev-is-bridged -j RETURN',
  '-A TTR-TYPEGEN-EGRESS -i br+ -j DROP',
  '-A TTR-TYPEGEN-EGRESS -i docker0 -o docker0 -j RETURN',
  '-A TTR-TYPEGEN-EGRESS -i docker0 -j DROP',
  '-A TTR-TYPEGEN-EGRESS -j RETURN',
];
export function assertFirewallPolicy({ rules, dockerUser, forward }) {
  if (
    JSON.stringify(rules.trim().split('\n')) !==
      JSON.stringify(firewallRules) ||
    dockerUser.split('\n').find((rule) => rule.startsWith('-A ')) !==
      '-A DOCKER-USER -j TTR-TYPEGEN-EGRESS' ||
    forward.split('\n').find((rule) => rule.startsWith('-A ')) !==
      '-A FORWARD -j TTR-TYPEGEN-EGRESS'
  ) {
    console.warn('Programming policy mismatch=firewall');
    throw new Error('Bridge egress firewall missing or reordered');
  }
}
export function verifyNetworkPolicy(run) {
  if (typeof run !== 'function')
    throw new Error('Explicit policy runner required');
  return readNetworkPolicy(run);
}
async function readNetworkPolicy(run) {
  console.info('Programming policy checkpoint=daemon-json');
  const daemon = JSON.parse(await run(['cat', '/etc/docker/daemon.json']));
  console.info('Programming policy checkpoint=kernel-json');
  const programs = JSON.parse(
    await run([
      'bpftool',
      '-j',
      'cgroup',
      'show',
      networkPolicy.cgroupPath,
      'effective',
    ])
  );
  console.info('Programming policy checkpoint=slice-addresses');
  if (!Array.isArray(programs)) {
    console.warn('Programming policy mismatch=kernel-shape');
    throw new Error('Kernel filter inventory must be an array');
  }
  const allow = await run([
    'systemctl',
    'show',
    networkPolicy.slice,
    '-p',
    'IPAddressAllow',
    '--value',
  ]);
  const deny = await run([
    'systemctl',
    'show',
    networkPolicy.slice,
    '-p',
    'IPAddressDeny',
    '--value',
  ]);
  console.info('Programming policy checkpoint=assertions');
  assertNetworkPolicy({ daemon, programs, allow, deny });
  console.info('Programming policy checkpoint=firewall');
  for (const firewall of ['iptables', 'ip6tables']) {
    assertFirewallPolicy({
      rules: await run([firewall, '-S', 'TTR-TYPEGEN-EGRESS']),
      dockerUser: await run([firewall, '-S', 'DOCKER-USER']),
      forward: await run([firewall, '-S', 'FORWARD']),
    });
  }
  return {
    ...networkPolicy,
    firewallRules,
    programIds: programs.map((program) => program.id),
  };
}
