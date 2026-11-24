"""Trusted launcher for one command in a fresh Cloudflare execution container."""

import ctypes
import json
import os
import re
import resource
import selectors
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path

UID = 65534
MAX_FILE_BYTES = 256 * 1024
MAX_PROJECT_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 64 * 1024
COMMAND_TIMEOUT = 30
# Wall and CPU seconds per check. A cold JVM needs more than gcc on the
# smallest instance. The Worker waits 4 seconds longer than the guest limit,
# so the guest always ends a slow check itself.
CHECK_SECONDS = {"c": 4, "cpp": 4, "java": 8}
CHECK_ADDRESS_SPACE = 512 * 1024 * 1024
PR_SET_PDEATHSIG = 1
# landlock_create_ruleset has the same number on every Linux architecture.
SYS_LANDLOCK_CREATE_RULESET = 444
LANDLOCK_CREATE_RULESET_VERSION = 1
MS_RDONLY, MS_NOSUID, MS_NODEV, MS_NOEXEC = 1, 2, 4, 8
MS_REMOUNT, MS_BIND = 32, 4096
MOUNT_FLAGS = {
    "nosuid": MS_NOSUID,
    "nodev": MS_NODEV,
    "noexec": MS_NOEXEC,
    "noatime": 1024,
    "nodiratime": 2048,
    "relatime": 1 << 21,
    "strictatime": 1 << 24,
    "nosymfollow": 256,
}
# Landlock ABI 3 is the first with every right in WRITE_RIGHTS (refer needs
# 2, truncate needs 3).
LANDLOCK_MIN_ABI = 3
# The only devices the sandbox sees; Landlock-equivalent except that zero,
# full and the random devices also accept harmless writes.
DEVICES = ("null", "zero", "full", "random", "urandom")
# The workspace tmpfs stays writable; the sandbox mounts a fresh /proc.
WRITABLE_MOUNTS = ("/tmp", "/proc")
MAX_CHECK_FILES = 20
MAX_CHECK_FILE_BYTES = 128 * 1024
MAX_CHECK_BYTES = 200 * 1024
# Server-chosen, compile-only commands. Sources are passed as ./path so a name
# beginning with "-" or "@" is never read as an option or an argument file.
CHECK_COMMANDS = {
    "c": ["/usr/bin/gcc", "-fsyntax-only", "-fdiagnostics-plain-output", "-std=gnu17", "-Wall"],
    "cpp": ["/usr/bin/g++", "-fsyntax-only", "-fdiagnostics-plain-output", "-std=gnu++20", "-Wall"],
    "java": [
        "/usr/bin/javac", "-J-XX:TieredStopAtLevel=1", "-J-XX:+UseSerialGC",
        "-J-Xmx192m", "-J-XX:MaxMetaspaceSize=96m", "-J-XX:ReservedCodeCacheSize=32m",
        "-J-XX:CICompilerCount=1", "-J-XX:-UsePerfData",
        "-proc:none", "-implicit:none", "-Xlint:all", "-Xmaxerrs", "200",
        "-Xmaxwarns", "200", "-encoding", "UTF-8", "-sourcepath", ".", "-classpath", ".",
        "-d", "/tmp/classes",
    ],
}
WORKSPACE = Path("/tmp/workspace")
SEGMENT = re.compile(r"[a-zA-Z0-9_.@+-]+")
EXCLUDED = {".", "..", ".git", ".venv", "node_modules", "__pycache__", "target"}
WRITE_RIGHTS = (
    "write-file,truncate,remove-dir,remove-file,make-char,make-dir,make-reg,"
    "make-sock,make-fifo,make-block,make-sym,refer"
)
WORKSPACE_RIGHTS = (
    "write-file,truncate,remove-dir,remove-file,make-dir,make-reg,make-fifo,"
    "make-sym,refer"
)
GUEST_ENV = {
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "HOME": "/tmp",
    "GOCACHE": "/tmp/go-build",
    "GOMODCACHE": "/tmp/go-mod",
    "GOPROXY": "off",
    "GOSUMDB": "off",
    "GOTOOLCHAIN": "local",
    "PYTHONDONTWRITEBYTECODE": "1",
    "LANG": "C.UTF-8",
}


def read_job():
    maximum = 13 * 1024 * 1024
    raw = sys.stdin.buffer.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError("Payload limit exceeded")
    job = json.loads(raw)
    if job.get("mode") == "check":
        return read_check(job)
    command = job["command"]
    stdin = job.get("stdin", "")
    files = job["files"]
    if not isinstance(command, str) or not command or len(command) > 4096 or "\0" in command:
        raise ValueError("Invalid command")
    if not isinstance(stdin, str) or len(stdin.encode()) > MAX_FILE_BYTES:
        raise ValueError("Invalid standard input")
    if not isinstance(files, list) or len(files) > 128:
        raise ValueError("Invalid file inventory")
    total = 0
    for file in files:
        path, content = file["path"], file["content"]
        if not isinstance(path, str) or len(path) > 240 or any(
            part in EXCLUDED or not SEGMENT.fullmatch(part) for part in path.split("/")
        ):
            raise ValueError("Invalid project path")
        if not isinstance(content, str) or "\0" in content:
            raise ValueError("Invalid project content")
        encoded = content.encode()
        total += len(encoded)
        if len(encoded) > MAX_FILE_BYTES or total > MAX_PROJECT_BYTES:
            raise ValueError("Project size limit exceeded")
    return job


def read_check(job):
    language, files, sources = job["language"], job["files"], job["sources"]
    if language not in CHECK_COMMANDS:
        raise ValueError("Unsupported check language")
    if not isinstance(files, list) or len(files) > MAX_CHECK_FILES:
        raise ValueError("Invalid file inventory")
    total = 0
    paths = set()
    for file in files:
        path, content = file["path"], file["content"]
        if not isinstance(path, str) or len(path) > 240 or any(
            part in EXCLUDED or not SEGMENT.fullmatch(part) for part in path.split("/")
        ):
            raise ValueError("Invalid project path")
        if not isinstance(content, str) or "\0" in content:
            raise ValueError("Invalid project content")
        encoded = len(content.encode())
        total += encoded
        if encoded > MAX_CHECK_FILE_BYTES or total > MAX_CHECK_BYTES:
            raise ValueError("Check size limit exceeded")
        paths.add(path)
    if not isinstance(sources, list) or len(sources) > MAX_CHECK_FILES or any(
        path not in paths for path in sources
    ):
        raise ValueError("Invalid check sources")
    return job


def check_command(job):
    return [*CHECK_COMMANDS[job["language"]], *("./" + path for path in job["sources"])]


def stage_files(files):
    subprocess.run(
        ["/usr/bin/mount", "-t", "tmpfs", "-o", "size=256m,nosuid,nodev,mode=1777", "tmpfs", "/tmp"],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=3,
    )
    WORKSPACE.mkdir(mode=0o700)
    os.chown(WORKSPACE, UID, UID)
    for file in files:
        target = WORKSPACE / file["path"]
        for directory in reversed(target.parents):
            if directory == WORKSPACE or WORKSPACE not in directory.parents:
                continue
            if not directory.exists():
                directory.mkdir(mode=0o700)
                os.chown(directory, UID, UID)
        with target.open("xb") as handle:
            handle.write(file["content"].encode())
        os.chown(target, UID, UID)
        target.chmod(0o600)


def die_with_launcher():
    # If the launcher is killed, its sandbox dies too. setpriv re-arms the
    # signal inside the sandbox, after the identity change that clears it.
    if ctypes.CDLL(None, use_errno=True).prctl(PR_SET_PDEATHSIG, 9, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "prctl failed")


def set_limits():
    die_with_launcher()
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NPROC, (128, 128))
    resource.setrlimit(resource.RLIMIT_NOFILE, (256, 256))
    resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024,) * 2)


def set_check_limits(language):
    def apply():
        set_limits()
        seconds = CHECK_SECONDS[language]
        resource.setrlimit(resource.RLIMIT_CPU, (seconds, seconds + 1))
        # The JVM reserves address space far beyond its heap; javac is bounded
        # by its heap, metaspace and code cache flags instead.
        if language != "java":
            resource.setrlimit(resource.RLIMIT_AS, (CHECK_ADDRESS_SPACE,) * 2)
    return apply


def landlock_supported():
    """Whether the kernel implements the Landlock ABI the rules need.

    ENOSYS, EOPNOTSUPP or a filtered syscall means no; the read-only mounts
    then hold the write bound alone.
    """
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    abi = libc.syscall(
        SYS_LANDLOCK_CREATE_RULESET, None, ctypes.c_size_t(0),
        ctypes.c_uint32(LANDLOCK_CREATE_RULESET_VERSION),
    )
    return abi >= LANDLOCK_MIN_ABI


def mounts():
    """The reachable mount at each mount point, with its per-mount options.

    mountinfo lists a mount after the mounts it covers. A mount at a path, or
    above it, hides every earlier mount there, so only the latest survives.
    """
    reachable = {}
    with open("/proc/self/mountinfo", "rb") as handle:
        for line in handle:
            fields = line.split()
            point = os.fsdecode(
                re.sub(rb"\\([0-7]{3})", lambda m: bytes([int(m.group(1), 8)]), fields[4])
            )
            for covered in [path for path in reachable if path == point or path.startswith(point.rstrip("/") + "/")]:
                del reachable[covered]
            reachable[point] = os.fsdecode(fields[5]).split(",")
    return reachable


def writable_mount(point):
    return any(point == root or point.startswith(root + "/") for root in WRITABLE_MOUNTS)


def minimal_dev(libc):
    """Replace /dev with a tmpfs holding only the devices programs need.

    The devices are bind mounts of the existing nodes, staged on the workspace
    tmpfs while the old /dev is still reachable, so no node is created.
    """
    staged = []
    for name in DEVICES:
        stage = "/tmp/.dev-" + name
        open(stage, "x").close()
        mount(libc, "/dev/" + name, stage, MS_BIND)
        staged.append((name, stage))
    mount(libc, "tmpfs", "/dev", MS_NOSUID | MS_NOEXEC, "tmpfs", b"size=64k,mode=0755")
    for name, stage in staged:
        open("/dev/" + name, "x").close()
        mount(libc, stage, "/dev/" + name, MS_BIND)
        if libc.umount2(stage.encode(), 0) != 0:
            raise OSError(ctypes.get_errno(), "device staging unmount failed")
        os.unlink(stage)
    for name, target in (("fd", "/proc/self/fd"), ("stdin", "/proc/self/fd/0"),
                         ("stdout", "/proc/self/fd/1"), ("stderr", "/proc/self/fd/2")):
        os.symlink(target, "/dev/" + name)


def mount(libc, source, target, flags, fstype=None, data=None):
    if libc.mount(source.encode(), target.encode(), fstype and fstype.encode(),
                  ctypes.c_ulong(flags), data) != 0:
        raise OSError(ctypes.get_errno(), "mount failed: " + target)


def confine_writes():
    """Make every mount but the workspace tmpfs read-only in this namespace.

    minimal_dev runs first, so the program can write to no device node beyond
    the fixed ones, and creates none.

    The bind remounts keep each mount's own nosuid, nodev, noexec and atime
    flags. The sandboxed program has no capabilities and no new privileges, so
    it cannot remount them. This holds the write bound on kernels without
    Landlock and backs Landlock up where it exists.
    """
    libc = ctypes.CDLL(None, use_errno=True)
    for point, options in mounts().items():
        if writable_mount(point) or "ro" in options:
            continue
        flags = MS_REMOUNT | MS_BIND | MS_RDONLY
        for option in options:
            flags |= MOUNT_FLAGS.get(option, 0)
        if libc.mount(None, point.encode(), None, ctypes.c_ulong(flags), None) != 0:
            raise OSError(ctypes.get_errno(), "read-only remount failed: " + point)
    left = [
        point for point, options in mounts().items()
        if not writable_mount(point) and "ro" not in options
    ]
    if left:
        raise OSError(0, "mounts left writable: " + ",".join(left))


def sandboxed(*command, landlock=True):
    rules = [
        "--landlock-access", "fs:" + WRITE_RIGHTS,
        "--landlock-rule", "path-beneath:" + WORKSPACE_RIGHTS + ":/tmp",
        "--landlock-rule", "path-beneath:write-file:/dev/null",
    ] if landlock else []
    return [
        "/usr/bin/unshare", "--net", "--pid", "--ipc", "--uts", "--fork", "--kill-child",
        "--mount-proc",
        "/usr/bin/setpriv", "--reuid", str(UID), "--regid", str(UID), "--clear-groups",
        "--pdeathsig", "KILL",
        "--bounding-set=-all", "--inh-caps=-all", "--ambient-caps=-all", "--no-new-privs",
        *rules,
        *command,
    ]


def preflight(landlock):
    # Build the same sandbox around a no-op first. A kernel or runtime that
    # cannot provide a namespace, the privilege drop or Landlock fails here,
    # before user code runs, and never surfaces as the program's own output.
    subprocess.run(
        sandboxed("/bin/true", landlock=landlock),
        check=True,
        cwd=WORKSPACE,
        env=GUEST_ENV,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        preexec_fn=set_limits,
        timeout=5,
    )


def run(args, stdin, timeout=COMMAND_TIMEOUT, limits=set_limits):
    with tempfile.TemporaryFile() as input_file:
        input_file.write(stdin.encode())
        input_file.seek(0)
        with subprocess.Popen(
            args,
            cwd=WORKSPACE,
            env=GUEST_ENV,
            stdin=input_file,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            preexec_fn=limits,
        ) as process:
            deadline = time.monotonic() + timeout
            output = bytearray()
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not selector.select(remaining):
                        process.kill()
                        return 124, output, "timeout"
                    chunk = os.read(process.stdout.fileno(), 8192)
                    if not chunk:
                        break
                    available = MAX_OUTPUT_BYTES - len(output)
                    output.extend(chunk[:available])
                    if len(chunk) > available:
                        process.kill()
                        return 125, output, "output_limit"
            try:
                code = process.wait(timeout=max(deadline - time.monotonic(), 0))
            except subprocess.TimeoutExpired:
                process.kill()
                return 124, output, "timeout"
            return code if code >= 0 else 128 - code, output, "exited"


def export_files(sources):
    """Return the saveable workspace, or None when a project file cannot be saved.

    The export is a complete inventory, so leaving out a project file would
    delete it. Build output the program created (binaries, unsupported names,
    oversized or non-text files) is left out instead.
    """
    if not stat.S_ISDIR(WORKSPACE.lstat().st_mode):
        raise ValueError("Workspace directory was replaced")
    files = []
    seen = set()
    total = 0
    entries = 0
    for directory, folders, names, directory_fd in os.fwalk(WORKSPACE):
        folders[:] = [name for name in folders if name not in EXCLUDED]
        entries += len(folders) + len(names)
        if entries > 512:
            return None
        for name in names:
            relative = str((Path(directory) / name).relative_to(WORKSPACE))
            if not stat.S_ISREG(os.stat(name, dir_fd=directory_fd, follow_symlinks=False).st_mode):
                continue
            if len(relative) > 240 or any(
                not SEGMENT.fullmatch(part) or part in EXCLUDED for part in relative.split("/")
            ):
                continue
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
            with os.fdopen(fd, "rb") as handle:
                data = handle.read(MAX_FILE_BYTES + 1)
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                continue
            if len(data) > MAX_FILE_BYTES or chr(0) in text:
                continue
            total += len(data)
            if total > MAX_PROJECT_BYTES or len(files) >= 128:
                return None
            files.append({"path": relative, "content": text})
            seen.add(relative)
    # A project file that was removed, replaced or made unsaveable is not
    # dropped silently; the run keeps its output and skips the save.
    if any(path not in seen for path in sources if os.path.lexists(WORKSPACE / path)):
        return None
    return files


def main():
    stage = "input"
    try:
        job = read_job()
        checking = job.get("mode") == "check"
        stage = "workspace"
        stage_files(job["files"])
        stage = "devices"
        minimal_dev(ctypes.CDLL(None, use_errno=True))
        stage = "confinement"
        confine_writes()
        stage = "landlock"
        landlock = landlock_supported()
        stage = "preflight"
        preflight(landlock)
        stage = "command"
        if checking:
            exit_code, output, outcome = run(
                sandboxed(*check_command(job), landlock=landlock), "",
                CHECK_SECONDS[job["language"]], set_check_limits(job["language"]),
            )
        else:
            exit_code, output, outcome = run(
                sandboxed("/bin/sh", "-c", job["command"], landlock=landlock),
                job.get("stdin", ""),
            )
    except (KeyError, OSError, TypeError, ValueError, subprocess.SubprocessError):
        # Only the fixed stage name leaves the guest, never the error text.
        checking, exit_code, outcome = False, 126, "sandbox_failed"
        output = ("sandbox_failed: " + stage + "\n").encode()
    files = None
    if outcome == "exited" and not checking:
        try:
            files = export_files([file["path"] for file in job["files"]])
        except (OSError, ValueError):
            files = None
    json.dump({
        "exitCode": exit_code,
        "output": output.decode("utf-8", errors="replace").encode("utf-8")[
            :MAX_OUTPUT_BYTES
        ].decode("utf-8", errors="ignore"),
        "outcome": outcome,
        "files": files,
    }, sys.stdout, ensure_ascii=True)


if __name__ == "__main__":
    main()
