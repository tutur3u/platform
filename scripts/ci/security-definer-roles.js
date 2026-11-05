const crypto = require('node:crypto');

const word = (t, v) => t?.kind === 'word' && !t.quoted && t.value === v;
function membership(ts) {
  const action = ts[0]?.value;
  if (!['grant', 'revoke'].includes(action) || ts.some((t) => word(t, 'on')))
    return null;
  // REVOKE ADMIN OPTION removes delegation, not membership.
  if (action === 'revoke' && word(ts[1], 'admin')) return null;
  const direction = ts.findIndex((t) =>
    word(t, action === 'grant' ? 'to' : 'from')
  );
  if (direction < 0) return null;
  const end = ts.findIndex(
    (t, i) =>
      i > direction &&
      ['with', 'granted', 'cascade', 'restrict'].some((v) => word(t, v))
  );
  const names = (list) => list.filter((t) => !word(t, ',')).map((t) => t.value);
  return {
    action,
    roles: names(ts.slice(1, direction)),
    members: names(ts.slice(direction + 1, end < 0 ? ts.length : end)),
  };
}

function inheritedFindings(
  parsed,
  functions,
  state,
  { parseAcl, matches, key }
) {
  for (const ts of parsed) {
    const edge = membership(ts);
    if (edge) {
      for (const member of edge.members) {
        const roles = state.members.get(member) ?? new Set();
        for (const role of edge.roles) {
          if (edge.action === 'grant') roles.add(role);
          else roles.delete(role);
        }
        state.members.set(member, roles);
      }
      continue;
    }
    let acl;
    try {
      acl = parseAcl(ts);
    } catch {
      continue;
    }
    if (!acl) continue;
    for (const fn of functions) {
      if (
        !(acl.schemas
          ? acl.schemas.includes(fn.target.schema)
          : acl.targets.some((t) => matches(t, fn, acl.action)))
      )
        continue;
      const roles = state.grants.get(key(fn)) ?? new Set();
      for (const role of acl.roles) {
        if (acl.action === 'grant') roles.add(role);
        else roles.delete(role);
      }
      state.grants.set(key(fn), roles);
    }
  }
  const reachable = new Set(['anon', 'public']);
  const pending = [...reachable];
  while (pending.length) {
    for (const role of state.members.get(pending.pop()) ?? []) {
      if (!reachable.has(role)) {
        reachable.add(role);
        pending.push(role);
      }
    }
  }
  const exposed = new Set();
  const findings = [];
  for (const fn of functions) {
    const roles = [...(state.grants.get(key(fn)) ?? [])]
      .filter((r) => !['anon', 'public'].includes(r) && reachable.has(r))
      .sort();
    if (!roles.length) continue;
    const id = key(fn);
    exposed.add(id);
    if (state.exposed.has(id)) continue;
    findings.push({
      function: fn.name,
      signature: fn.signature,
      rule: 'public-execute',
      message: 'anonymous EXECUTE inherited through role membership',
      digest: crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            definition: fn.digest,
            roles,
            memberships: [...state.members]
              .map(([m, rs]) => [m, [...rs].sort()])
              .sort(),
          })
        )
        .digest('hex'),
    });
  }
  state.exposed = exposed;
  return findings;
}
module.exports = { inheritedFindings };
