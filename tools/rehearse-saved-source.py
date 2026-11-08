"""Secret-free disposable source-copy rehearsal; NOT a public Git clone or manual build.
Run as a trusted local root operator with nobody available; no managed env passed to child.
"""
import io
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import tempfile

if os.getuid() != 0:
    raise SystemExit('Use a disposable local operator capable of switching to nobody')
pg_bin = os.environ.get('TV_LOCAL_PG_BIN')
if not pg_bin or not Path(pg_bin).is_absolute():
    raise SystemExit('Set explicit pinned PostgreSQL 17.11 bin directory (see tests/backend/fresh-local.sh)')
ref = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
root = Path(tempfile.mkdtemp(prefix='trustvault-source-rehearsal-', dir='/tmp'))
with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git', 'archive', ref])), mode='r:') as archive:
    for entry in archive.getmembers():
        parts = PurePosixPath(entry.name).parts
        if any(p in {'.git', 'node_modules', 'dist', '.output', '.vinxi', '.tanstack'} for p in parts):
            continue
        if any(p.startswith('.env') and p != '.env.example' for p in parts):
            continue
        if entry.issym() or entry.islnk() or '..' in parts or entry.name.startswith('/'):
            raise SystemExit('Unsafe/non-source archive entry; inspection required')
        archive.extract(entry, root, filter='data')
label = ref
if os.environ.get('TV_REHEARSE_WORKTREE') == '1':
    # Explicitly labelled: saved HEAD plus current uncommitted tracked/untracked source overlay (read-only git queries).
    changed = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], text=True).split()
    changed += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], text=True).split()
    for name in changed:
        parts = PurePosixPath(name).parts
        if any(p in {'.git', 'node_modules', 'dist'} for p in parts) or any(p.startswith('.env') and p != '.env.example' for p in parts):
            continue
        src = Path(name)
        dst = root / name
        if src.is_symlink():
            raise SystemExit('Unsafe overlay entry')
        if src.exists():
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(src.read_bytes())
        elif dst.exists():
            dst.unlink()
    label = ref + '+worktree-overlay(' + str(len(changed)) + ' files)'
(root / 'REHEARSAL_REF.txt').write_text(label + '\n')
(root / 'home').mkdir(mode=0o700)
subprocess.run(['chown', '-R', 'nobody:nogroup', str(root)], check=True)
environment = ['env', '-i', 'PATH=/usr/bin:/bin', f'HOME={root}/home', f'TV_LOCAL_PG_BIN={pg_bin}']
print('Source copy:', label, root, flush=True)
for command in [
    ['bun', 'install', '--frozen-lockfile'],
    ['node', '--test', 'tools/audit-checkpoints/checkpoints.test.mjs', 'tools/audit-checkpoints/ancestry.test.mjs'],
    ['node', '--expose-gc', '--test', 'tools/admission-mutation.test.mjs'],
    ['bunx', 'vitest', 'run', 'src/lib/backend/bounded-stream.test.ts', 'src/lib/backend/bounded-body.test.ts', 'src/lib/backend/file-validation.test.ts', 'src/lib/backend/scanner.test.ts', 'src/lib/backend/upload-pipeline.test.ts', 'src/test/app-routing.test.tsx'],
    ['bash', 'tests/backend/fresh-local.sh'],
]:
    print('Running:', ' '.join(command), flush=True)
    subprocess.run(['runuser', '-u', 'nobody', '--', *environment, *command], cwd=root, check=True)
print('Public Git clone and manual build/typecheck UNRUN; no real environment/dependencies/credentials copied')
