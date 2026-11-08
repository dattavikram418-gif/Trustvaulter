# Submission checklist (current)

Updated 2026-11-05 UTC. Earlier version: `docs/history/SUBMISSION_CHECKLIST_LOG.md`. Requirement map: `PROJECT_STATUS.md`.

- [x] Source, migrations 0000–0018 (applied ones unchanged; canonical audit bytes preserved)
- [x] README with exact versions, start, roles, provisioning, test commands; `compose.yaml` test DB
- [x] API.md, THREATS.md, PROMPTS.md, EVALUATION_PLAN.md, FINAL_WRITEUP.md, DEMO_SCRIPT.md
- [x] Author-run tests on current code: DB 458 PASS lines / 479 assertions, Vitest 59/59, tools 24+4
- [x] Clean saved-source rehearsal on the last functional code ref `16268db`
- [ ] Rehearsal on the wrap-up commit (platform now refuses `git archive`; see `docs/BACKEND_STATUS.md`)
- [x] A01–A03 closed at code-review level by independent monitor
- [ ] Independent full rerun of the suites
- [ ] Demo video
- [ ] Content delivery, real scanner, external audit anchor, deployment attack testing (`docs/REMAINING_WORK.md`)
- [ ] `compose.yaml` actually run with Docker (not available in authoring sandbox)
