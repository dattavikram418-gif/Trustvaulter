# Optional isolated structural reference — offline only

This is **not installed in the hosted app**, not antivirus, sanitization or safe-content proof. Existing connected PDF/PNG/JPEG/TXT upload prefilters remain unchanged; they may store marker-valid malformed content in unreadable quarantine. No migration, evidence-table change, parser HTTP endpoint, release switch or external file transfer is added.

## Exact supported capability

`reference.py` accepts only static **8-bit non-interlaced PNG** with IHDR/IDAT/IEND, grayscale/RGB with optional alpha; it refuses palette/metadata/animation/unknown chunks. Bounded framing/CRC checks supplement the maintained **Pillow 12.1.1** verifier and full decoder; they are not a replacement image parser. IEND must end exactly at EOF. IDAT uses maintained zlib decoding with a strict expected output limit, exactly one ended stream and no trailing compressed bytes. Known appended/concatenated/polyglot samples are refused; this does not prove absence of every polyglot.

**PDF and JPEG return `unsupported`, never `passed`.** qpdf 12.3.2 is present and documented but deliberately not used as a passing capability: `--check --suppress-recovery` checks syntax/encoding, not universal page semantics, exact consumption or aggregate expansion. Pillow JPEG verify/load accepts trailing bytes, even with another EOI; no reviewed exact-codestream interface is implemented here. No homemade PDF/JPEG parser was written. TXT has no offline structural capability; existing UTF-8 connected prefilter remains.

## Bounds and containment

- Input: 1–10,485,760 bytes, local private 0600 scratch snapshot, no caller executable/path arguments to the child.
- PNG: each dimension <=8192, <=16,000,000 pixels, <=64 MiB expanded scanline stream, <=4096 chunks. Unknown compressed text/metadata refused, rather than decoded without bound.
- One short-lived child per CLI invocation: 5-second wall deadline, process-group SIGKILL on timeout/error; Linux RLIMIT CPU3s, address space512MiB, output/file4096 bytes, descriptors32, no core dumps. Decoder failure/missing version/timeout returns unavailable/rejected, never pass. Temporary output is capped by RLIMIT_FSIZE and parsed <=4096 bytes; raw decoder diagnostics are suppressed.
- These limits do not enforce aggregate concurrent operator invocations, contain native-code compromise, or prevent network access. **Operator must use an unprivileged no-network sandbox/container**, read-only root, no app/Cloud credentials or storage mounts, quota-limited noexec scratch, cgroup512MiB/process limits, single-job supervisor. No infrastructure is provisioned here. The local test executes a real child under resource limits, not a demonstrated production sandbox.

## Reproduction and approval

On an approved disposable local host, Python3.13 and a security-reviewed pinned Pillow build:

```sh
python3 -m venv /tmp/tv-structure-venv
/tmp/tv-structure-venv/bin/python -m pip install --no-deps -r services/structure/requirements.txt
PYTHONDONTWRITEBYTECODE=1 /tmp/tv-structure-venv/bin/python -m unittest discover -s services/structure -p 'test_*.py' -v
# Synthetic local file only; UUIDs label evidence, not authorization:
/tmp/tv-structure-venv/bin/python services/structure/reference.py /tmp/synthetic.png \
  --media image/png --parent-id 11111111-1111-4111-8111-111111111111 \
  --version-id 22222222-2222-4222-8222-222222222222 --approved-local-reference
```

Without explicit approval, CLI returns unavailable/exit2. Failure/unsupported is exit2; only narrow structural pass is exit0. Local evidence includes exact digest/size/media/parent/version/policy, decoder/zlib version, `offline-untrusted-not-persisted`, unchanged quarantine and disabled delivery. Parent/version labels are **operator supplied**, not database-authorized; output cannot be sent to the existing scan RPC or treated as connected signed evidence. No keys/endpoint/secret fields. Do not retain bytes or confidential logs. Reviewed authenticated digest/size/parent/version evidence ingestion remains separate engineering work if this is ever integrated.

## Primary sources reviewed 2026-11-01 America/Chicago

- Pillow version-tagged upstream Image API: https://raw.githubusercontent.com/python-pillow/Pillow/12.1.1/docs/reference/Image.rst
- PNG decoder/framing behavior: https://raw.githubusercontent.com/python-pillow/Pillow/12.1.1/src/PIL/PngImagePlugin.py
- qpdf version-tagged manual and `--check` limits: https://raw.githubusercontent.com/qpdf/qpdf/v12.3.2/manual/cli.rst
- Image API: https://pillow.readthedocs.io/en/latest/reference/Image.html

Tests create synthetic PNG/JPEG using real installed Pillow, run a real isolated PNG child, and reject CRC/truncation/trailing/duplicate-IEND/expansion/metadata/dimension samples. Missing-version and kill-timeout tests are **mocks**; actual native crash, memory kill, timeout under adversarial decoder input and production sandbox are UNRUN. A real removed-trailing-guard source mutant causes the duplicate-IEND negative to accept, proving that regression kills the mutation. No real PDF full-validator or AV/EICAR claim.
