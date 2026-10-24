// Layout: Apple's xnu bsd/sys/proc_info.h and proc_info_private.h (flavors
// 17/18), plus the LP64 kinfo_proc from sys/sysctl.h for cross-user rows.
// Keep strings for uint64 values; JavaScript must never round a process birth.
export const darwinProcessProbe = `
import ctypes as c
import errno
import json
import os
import sys

def unavailable(reason):
    return {"kind": "unavailable", "reason": reason}

def main():
    if sys.platform != "darwin" or sys.byteorder != "little" or c.sizeof(c.c_void_p) != 8 or os.uname().machine not in ("arm64", "x86_64"):
        return unavailable("Unsupported Darwin process ABI")
    lib = c.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    libc = c.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
    class BSD(c.Structure):
        _fields_ = [(name, c.c_uint32) for name in (
            "flags", "status", "xstatus", "pid", "ppid", "uid", "gid",
            "ruid", "rgid", "svuid", "svgid", "rfu")]
        _fields_ += [("comm", c.c_char * 16), ("name", c.c_char * 32)]
        _fields_ += [(name, c.c_uint32) for name in (
            "nfiles", "pgid", "pjobc", "tdev", "tpgid")]
        _fields_ += [("nice", c.c_int32), ("sec", c.c_uint64), ("usec", c.c_uint64)]
    class Unique(c.Structure):
        _fields_ = [("uuid", c.c_uint8 * 16), ("uniqueid", c.c_uint64),
                    ("parentid", c.c_uint64), ("version", c.c_int32),
                    ("parentversion", c.c_int32), ("reserve2", c.c_uint64),
                    ("reserve3", c.c_uint64)]
    class Info(c.Structure):
        _fields_ = [("bsd", BSD), ("unique", Unique)]
    if (c.sizeof(BSD), c.sizeof(Unique), c.sizeof(Info), BSD.pid.offset,
        BSD.pgid.offset, BSD.sec.offset, BSD.usec.offset,
        Info.unique.offset, Unique.uniqueid.offset) != (136, 56, 192, 12, 100, 120, 128, 136, 16):
        return unavailable("Darwin process ABI size/offset mismatch")
    lib.proc_pidinfo.argtypes = [c.c_int, c.c_int, c.c_uint64, c.c_void_p, c.c_int]
    lib.proc_pidinfo.restype = c.c_int
    lib.proc_listpids.argtypes = [c.c_uint32, c.c_uint32, c.c_void_p, c.c_int]
    lib.proc_listpids.restype = c.c_int
    libc.kill.argtypes = [c.c_int, c.c_int]
    libc.kill.restype = c.c_int
    libc.gethostuuid.argtypes = [c.c_void_p, c.c_void_p]
    libc.gethostuuid.restype = c.c_int
    libc.sysctlbyname.argtypes = [c.c_char_p, c.c_void_p, c.POINTER(c.c_size_t), c.c_void_p, c.c_size_t]
    libc.sysctlbyname.restype = c.c_int
    libc.sysctl.argtypes = [c.POINTER(c.c_int), c.c_uint, c.c_void_p, c.POINTER(c.c_size_t), c.c_void_p, c.c_size_t]
    libc.sysctl.restype = c.c_int

    def unique(pid):
        info = Unique()
        if lib.proc_pidinfo(pid, 17, 1, c.byref(info), 56) != 56:
            return 0
        return info.uniqueid

    # Flavor 18 is same-user only. Flavor 17 and kern.proc.pid are not, and
    # both kinfo p_starttime and flavor 18 pbi_start copy the same p_start.
    # Equal unique IDs before and after the kinfo read bind it to that lifetime.
    def split(pid):
        first = unique(pid)
        if first == 0:
            return None
        mib = (c.c_int * 4)(1, 14, 1, pid)
        buf = (c.c_uint8 * 648)()
        length = c.c_size_t(648)
        if libc.sysctl(mib, 4, buf, c.byref(length), None, 0) != 0 or length.value != 648:
            return None
        if unique(pid) != first:
            return None
        k = bytes(buf)
        def field(offset, size):
            return int.from_bytes(k[offset:offset + size], "little", signed=True)
        seconds, micros, status = field(0, 8), field(8, 4), k[36]
        parent, group = field(560, 4), field(564, 4)
        if (field(40, 4) != pid or status not in (1, 2, 3, 4, 5) or seconds <= 0
                or not 0 <= micros < 1000000 or parent < 0 or group <= 0):
            return None
        return {"pid": pid, "kind": "split", "parent": parent, "group": group,
                "status": status, "unique": str(first), "seconds": str(seconds),
                "micros": micros}

    def read(pid, fallback):
        info = Info()
        c.set_errno(0)
        # arg=1 includes unreaped zombies; excluding them loses their group.
        size = lib.proc_pidinfo(pid, 18, 1, c.byref(info), 192)
        if size != 192:
            row = split(pid) if fallback else None
            if row is not None:
                return row
            # A failed flavor lookup is not evidence of absence. Verify ESRCH.
            c.set_errno(0)
            if libc.kill(pid, 0) == -1 and c.get_errno() == errno.ESRCH:
                return {"pid": pid, "kind": "gone"}
            row = {"pid": pid, "kind": "unavailable"}
            try:
                row["group"] = os.getpgid(pid)
            except OSError:
                pass
            return row
        b = info.bsd
        if b.pid != pid or b.status not in (1, 2, 3, 4, 5):
            return {"pid": pid, "kind": "unavailable"}
        if b.sec == 0 or b.usec >= 1000000 or info.unique.uniqueid == 0:
            return {"pid": pid, "kind": "unavailable", "group": b.pgid}
        return {"pid": pid, "kind": "present", "bytes": bytes(info).hex()}

    own = read(os.getpid(), False)
    if own["kind"] != "present":
        return unavailable("Darwin flavor 18 unavailable or unsupported ABI")
    own_info = Info.from_buffer_copy(bytes.fromhex(own["bytes"]))
    if own_info.bsd.ppid != os.getppid() or own_info.bsd.pgid != os.getpgrp():
        return unavailable("Darwin process ABI self-check failed")
    # Enable the cross-user path only when it reproduces our exact flavor 18
    # identity; otherwise unreadable rows stay unavailable as before.
    own_split = split(os.getpid())
    fallback = own_split is not None and (
        own_split["unique"], own_split["seconds"], own_split["micros"],
        own_split["parent"], own_split["group"]) == (
        str(own_info.unique.uniqueid), str(own_info.bsd.sec), own_info.bsd.usec,
        own_info.bsd.ppid, own_info.bsd.pgid)
    class Timespec(c.Structure):
        _fields_ = [("sec", c.c_long), ("nsec", c.c_long)]
    host = (c.c_uint8 * 16)()
    timeout = Timespec(1, 0)
    if libc.gethostuuid(c.byref(host), c.byref(timeout)) != 0 or not any(host):
        return unavailable("Darwin stable host identity unavailable")
    h = bytes(host).hex()
    host_uuid = h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
    boot = c.create_string_buffer(128)
    length = c.c_size_t(c.sizeof(boot))
    if libc.sysctlbyname(b"kern.bootsessionuuid", boot, c.byref(length), None, 0) != 0 or length.value > 128:
        return unavailable("Darwin boot session identity unavailable")
    scope = {"backend": "darwin-libproc-v1", "host": host_uuid,
             "boot": boot.value.decode("ascii").lower(), "namespace": "darwin-host"}
    mode = sys.argv[1]
    if mode == "observe":
        pid = int(sys.argv[2])
        if pid <= 0 or pid > 2147483647:
            return unavailable("Invalid PID")
        return {"kind": "ready", "context": scope, "rows": [read(pid, fallback)], "complete": True}
    if mode != "snapshot":
        return unavailable("Invalid probe mode")
    # Bounded retries detect a process table growing beyond the allocated buffer.
    needed = lib.proc_listpids(1, 0, None, 0)
    for attempt in range(3):
        count = needed // 4 + 256
        if needed <= 0 or count > 65536:
            return unavailable("Darwin process inventory exceeds supported bounds")
        pids = (c.c_int * count)()
        size = lib.proc_listpids(1, 0, pids, c.sizeof(pids))
        if size <= 0 or size % 4 != 0:
            return unavailable("Darwin process enumeration failed")
        if size < c.sizeof(pids):
            # The observer is not workload. It exits before its parent consumes this snapshot.
            values = sorted(set(pid for pid in pids[:size // 4] if pid > 0 and pid != os.getpid()))
            rows = [read(pid, fallback) for pid in values]
            return {"kind": "ready", "context": scope, "rows": rows,
                    "complete": all(row["kind"] != "unavailable" for row in rows)}
        needed = size + 1024
    return unavailable("Darwin process enumeration did not stabilize")

try:
    result = main()
except Exception:
    result = unavailable("Darwin native process metadata unavailable")
print(json.dumps(result, separators=(",", ":")))
`;
