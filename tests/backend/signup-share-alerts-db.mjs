import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// 0019 on the FULL current schema: self-service verified signup role, share by verified email, sign-in alerts.
// Real PostgreSQL transactions. auth.users/auth.sessions are the local contract stub from run.mjs: the hosted auth
// service's own signup/verification/sign-in behaviour is simulated by the column updates it performs, not exercised.
export async function testSignupShareAlerts(sql, ids, sessions) {
  let checks = 0; const mutantsKilled = [];
  const check = async (label, fn) => { await fn(); checks++; console.log(`PASS self-service ${label}`); };
  const ADMIN = ids[5];
  const exp = () => Math.floor(Date.now() / 1000) + 3600;
  const call = (claims, action, payload) => sql.begin(async tx => {
    await tx.unsafe('SET LOCAL ROLE authenticated');
    await tx`SELECT set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;
    return (await tx`SELECT public.tv_operation(${action},${tx.json(payload)}) AS r`)[0].r;
  });
  const as = (u, action, payload = {}) => call({ sub: u.id, session_id: u.sid, exp: exp() }, action, payload);
  const auditOf = async id => (await sql`SELECT * FROM public.audit_events WHERE request_id=${id}`)[0];
  const roleOf = async id => (await sql`SELECT role FROM public.user_roles WHERE user_id=${id}`)[0]?.role;
  async function account(email, { confirmed = false } = {}) {
    const u = { id: randomUUID(), sid: randomUUID(), email };
    await sql`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${u.id},${email},${confirmed ? sql`clock_timestamp()` : null})`;
    await sql`INSERT INTO auth.sessions(id,user_id) VALUES(${u.sid},${u.id})`;
    return u;
  }
  const verify = u => sql`UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id=${u.id}`;
  const signIn = u => sql`UPDATE auth.users SET last_sign_in_at=clock_timestamp() WHERE id=${u.id}`;

  // --- Signup and least privilege ---
  const alice = await account('alice@example.test');
  await check('new self-registered account starts as viewer', async () => assert.equal(await roleOf(alice.id), 'viewer'));
  await check('unverified viewer cannot create documents', async () => assert.equal((await as(alice, 'create', { name: 'Too early' })).status, 404));
  await verify(alice);
  await check('email verification grants document_creator only', async () => assert.equal(await roleOf(alice.id), 'document_creator'));
  await sql`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${alice.id}`; await verify(alice);
  await check('re-verification never escalates beyond document_creator', async () => assert.equal(await roleOf(alice.id), 'document_creator'));
  const provisioned = await account('provisioned@example.test', { confirmed: true });
  await check('operator-provisioned confirmed account keeps viewer', async () => assert.equal(await roleOf(provisioned.id), 'viewer'));
  await check('verification trigger leaves an administrator untouched', async () => {
    await sql`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${ADMIN}`; await sql`UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id=${ADMIN}`;
    assert.equal(await roleOf(ADMIN), 'administrator');
  });
  for (const forged of [{ role: 'administrator' }, { owner_id: ADMIN }]) {
    await check(`role forgery in create payload rejected ${Object.keys(forged)[0]}`, async () => assert.equal((await as(alice, 'create', { name: 'x', ...forged })).status, 400));
  }
  await check('self-service user cannot reach admin projection', async () => assert.equal((await as(alice, 'admin_events', {})).status, 404));
  for (const table of ['user_roles', 'account_notifications', 'share_email_attempts']) {
    await check(`direct ${table} write denied to authenticated`, async () => assert.rejects(sql.begin(async tx => { await tx.unsafe('SET LOCAL ROLE authenticated'); await tx.unsafe(`UPDATE public.${table} SET ${table === 'user_roles' ? "role='administrator'" : 'id=id'}`); }), /permission denied/));
  }
  for (const fn of ['tv_share_email(jsonb)', 'tv_notifications(text,jsonb)', 'tv_notify(uuid,text,uuid)', 'tv_verified_caller()']) {
    await check(`internal ${fn} not directly executable`, async () => assert.rejects(sql.begin(async tx => { await tx.unsafe('SET LOCAL ROLE authenticated'); await tx.unsafe(`SELECT public.${fn.replace('(jsonb)', "('{}'::jsonb)").replace('(text,jsonb)', "('notifications','{}'::jsonb)").replace('(uuid,text,uuid)', `('${ADMIN}','own_sign_in','${ADMIN}')`)}`); }), /permission denied/));
  }

  // --- Share by verified email ---
  const bob = await account('Bob@Example.test'); await verify(bob);
  const pending = await account('pending@example.test');
  const mallory = await account('mallory@example.test'); await verify(mallory);
  const doc = (await as(alice, 'create', { name: 'Alice contract', category: 'Legal' })).data;
  let revision = doc.acl_revision;
  const unknown = await as(alice, 'share_email', { id: doc.id, revision, email: 'nobody@example.test', permission: 'read' });
  const unconfirmed = await as(alice, 'share_email', { id: doc.id, revision, email: 'pending@example.test', permission: 'read' });
  const self = await as(alice, 'share_email', { id: doc.id, revision, email: 'alice@example.test', permission: 'read' });
  await check('unknown, unverified and self addresses give one identical response', () => {
    for (const r of [unknown, unconfirmed, self]) assert.deepEqual({ status: r.status, error: r.error }, { status: 404, error: 'No eligible account for that address' });
  });
  await check('unavailable recipient denial audited without recipient id', async () => { const e = await auditOf(unknown.request_id); assert.deepEqual([e.actor_id, e.action, e.outcome, e.reason, JSON.stringify(e.changes)], [alice.id, 'share_email', 'denied', 'recipient_unavailable', '{}']); });
  const nonOwner = await as(mallory, 'share_email', { id: doc.id, revision, email: 'bob@example.test', permission: 'edit' });
  await check('non-owner share denied as Not found before lookup', () => assert.deepEqual({ status: nonOwner.status, error: nonOwner.error }, { status: 404, error: 'Not found' }));
  await check('non-owner cannot view document', async () => assert.equal((await as(mallory, 'detail', { id: doc.id })).status, 404));
  const duplicate = await account('BOB@example.test', { confirmed: true });
  await check('ambiguous verified address is denied and audited', async () => {
    const r = await as(alice, 'share_email', { id: doc.id, revision, email: 'bob@example.test', permission: 'read' });
    assert.equal(r.status, 404);
    assert.equal((await auditOf(r.request_id)).reason, 'recipient_unavailable');
    assert.equal((await as(bob, 'detail', { id: doc.id })).status, 404);
    assert.equal((await as(duplicate, 'detail', { id: doc.id })).status, 404);
  });
  await sql`UPDATE auth.users SET email='duplicate-renamed@example.test' WHERE id=${duplicate.id}`;
  const shared = await as(alice, 'share_email', { id: doc.id, revision, email: ' BOB@example.TEST ', permission: 'read' });
  await check('owner shares by case-insensitive verified email', () => { assert.equal(shared.status, 200); assert.equal(shared.data.user_id, bob.id); assert.equal(shared.data.shared_email, 'bob@example.test'); });
  revision = shared.data.revision;
  await check('share writes v2 grant audit with recipient and revisions', async () => { const e = await auditOf(shared.request_id); assert.deepEqual([e.action, e.outcome, e.actor_id, e.session_id, e.changes.target_user_id, e.changes.old_permission, e.changes.new_permission], ['grant', 'allowed', alice.id, alice.sid, bob.id, null, 'read']); });
  await check('recipient can read, cannot edit', async () => { assert.equal((await as(bob, 'detail', { id: doc.id })).status, 200); assert.equal((await as(bob, 'edit', { id: doc.id, revision, name: 'x' })).status, 404); });
  await check('recipient cannot re-share', async () => assert.equal((await as(bob, 'share_email', { id: doc.id, revision, email: 'mallory@example.test', permission: 'read' })).status, 404));
  const grants = await as(alice, 'grants', { id: doc.id });
  await check('owner grant list carries typed address label', () => assert.deepEqual(grants.data.map(g => [g.user_id, g.permission, g.shared_email]), [[bob.id, 'read', 'bob@example.test']]));
  const stale = await as(alice, 'share_email', { id: doc.id, revision: revision - 1, email: 'bob@example.test', permission: 'edit' });
  await check('stale revision refused through existing grant path', () => assert.equal(stale.status, 409));
  const upgrade = await as(alice, 'share_email', { id: doc.id, revision, email: 'bob@example.test', permission: 'edit' }); revision = upgrade.data.revision;
  await check('upgrade read->edit', async () => assert.equal((await as(bob, 'edit', { id: doc.id, revision, name: 'Bob edit' })).status, 200)); revision++;
  const revoke = await as(alice, 'revoke', { id: doc.id, revision, user_id: bob.id }); revision = revoke.data.revision;
  await check('revoke removes access with current DB authority', async () => { assert.equal(revoke.status, 200); assert.equal((await as(bob, 'detail', { id: doc.id })).status, 404); });
  for (const bad of [null, [], { id: doc.id }, { id: doc.id, revision, email: 'x@y.z', permission: 'owner' }, { id: doc.id, revision: '1', email: 'x@y.z', permission: 'read' }, { id: doc.id, revision, email: 'not-an-email', permission: 'read' }, { id: doc.id, revision, email: `${'a'.repeat(250)}@b.cd`, permission: 'read' }, { id: doc.id, revision, email: 'x@y.z', permission: 'read', user_id: bob.id }, { id: 'nope', revision, email: 'x@y.z', permission: 'read' }]) {
    const r = await as(alice, 'share_email', bad);
    await check(`invalid share payload ${JSON.stringify(bad)?.slice(0, 40)} -> 400 audited`, async () => { assert.equal(r.status, 400); assert.equal((await auditOf(r.request_id)).reason, 'invalid_parameters'); });
  }
  const huge = await as(alice, 'share_email', { id: doc.id, revision, email: 'x@y.z', permission: 'read', pad: 'x'.repeat(17000) });
  await check('oversized share payload 413 audited', async () => { assert.equal(huge.status, 413); assert.equal((await auditOf(huge.request_id)).reason, 'request_too_large'); });
  const forged = await call({ sub: alice.id, session_id: randomUUID(), exp: exp() }, 'share_email', { id: doc.id, revision, email: 'bob@example.test', permission: 'read' });
  await check('wrong-session share denied and unattributed', async () => { assert.equal(forged.status, 401); const e = await auditOf(forged.request_id); assert.deepEqual([e.actor_id, e.session_id], [null, null]); });
  // Rate bound: 20 resolution attempts per owner per hour (counted from this suite's attempts so far).
  const [{ used }] = await sql`SELECT count(*)::int used FROM public.share_email_attempts WHERE actor_id=${alice.id}`;
  for (let i = used; i < 20; i++) await as(alice, 'share_email', { id: doc.id, revision, email: `probe${i}@example.test`, permission: 'read' });
  const limited = await as(alice, 'share_email', { id: doc.id, revision, email: 'bob@example.test', permission: 'read' });
  await check('21st attempt within an hour rate limited 429 audited', async () => { assert.equal(limited.status, 429); assert.equal((await auditOf(limited.request_id)).reason, 'rate_limited'); });
  await check('rate limit does not grant', async () => assert.equal((await as(bob, 'detail', { id: doc.id })).status, 404));
  await sql`UPDATE public.share_email_attempts SET at=at-interval '2 hours' WHERE actor_id=${alice.id}`;

  // Mutant: remove the owner check -> non-owner share must stop being denied.
  const [{ def }] = await sql`SELECT pg_get_functiondef('public.tv_share_email(jsonb)'::regprocedure) def`;
  const mutant = def.replace('OR doc.owner_id<>caller.actor THEN', 'THEN'); assert.notEqual(mutant, def);
  // Without it, a non-owner could probe addresses: unknown address would answer 'No eligible account' instead of 'Not found'.
  const probe = async () => { const r = await as(mallory, 'share_email', { id: doc.id, revision, email: 'nobody@example.test', permission: 'read' }); assert.deepEqual({ status: r.status, error: r.error }, { status: 404, error: 'Not found' }); };
  await check('non-owner cannot probe addresses', probe);
  await sql.unsafe(mutant);
  let killed = false; try { await probe(); } catch { killed = true; }
  await sql.unsafe(def); await sql.unsafe('REVOKE ALL ON FUNCTION public.tv_share_email(jsonb) FROM PUBLIC,anon,authenticated,service_role');
  await check('mutant without share owner check killed', () => assert.equal(killed, true)); mutantsKilled.push('share owner check');
  await check('existing grant path still refuses non-owner after mutant restore', async () => assert.equal((await as(mallory, 'share_email', { id: doc.id, revision, email: 'bob@example.test', permission: 'read' })).status, 404));

  // --- Sign-in alerts ---
  const notes = async u => (await as(u, 'notifications', {})).data;
  await sql`DELETE FROM public.account_notifications`;
  await signIn(bob);
  await check('accepted sign-in alerts account holder', async () => assert.deepEqual((await notes(bob)).map(n => [n.kind, n.subject_id]), [['own_sign_in', bob.id]]));
  await check('accepted sign-in alerts administrator with account id only', async () => { const n = await sql`SELECT kind,subject_id FROM public.account_notifications WHERE recipient_id=${ADMIN}`; assert.deepEqual(n.map(x => [x.kind, x.subject_id]), [['account_sign_in', bob.id]]); });
  await check('other accounts receive nothing (isolation)', async () => { assert.deepEqual(await notes(mallory), []); assert.deepEqual(await notes(alice), []); });
  for (let i = 0; i < 5; i++) await signIn(bob);
  await check('repeat sign-ins coalesce per hour (no flood)', async () => { const n = await notes(bob); assert.equal(n.length, 1); assert.equal(n[0].occurrences, 6); });
  await sql`UPDATE auth.users SET email='renamed@example.test' WHERE id=${bob.id}`;
  await check('non-sign-in auth updates do not alert', async () => assert.equal((await notes(bob))[0].occurrences, 6));
  await check('notification projection has no email or session fields', async () => assert.ok((await notes(bob)).every(n => Object.keys(n).sort().join(',') === 'first_at,id,kind,last_at,occurrences,read_at,subject_id')));
  const bobNote = (await notes(bob))[0];
  const steal = await as(mallory, 'notifications_read', { id: bobNote.id });
  await check('cannot mark another account notification', async () => { assert.equal(steal.status, 404); assert.equal((await notes(bob))[0].read_at, null); });
  await check('owner marks own notification read', async () => { assert.equal((await as(bob, 'notifications_read', { id: bobNote.id })).status, 200); assert.notEqual((await notes(bob))[0].read_at, null); });
  for (const bad of [{ limit: 0 }, { limit: 51 }, { limit: 123456789012 }, { limit: '5' }, { recipient_id: bob.id }, { id: bob.id, extra: 1 }]) {
    const action = 'id' in bad ? 'notifications_read' : 'notifications';
    await check(`invalid notifications payload ${JSON.stringify(bad)} 400`, async () => assert.equal((await as(mallory, action, bad)).status, 400));
  }
  const unauth = await call({ sub: bob.id, session_id: randomUUID(), exp: exp() }, 'notifications', {});
  await check('forged session cannot read notifications; unattributed audit', async () => { assert.equal(unauth.status, 401); assert.equal((await auditOf(unauth.request_id)).actor_id, null); });
  // Session-denied alerts: genuine token whose session has ended.
  const before = (await sql`SELECT count(*)::int n FROM public.account_notifications`)[0].n;
  await call({ sub: mallory.id, session_id: randomUUID(), exp: exp() }, 'notifications', {}); // unattributed path
  await call({ exp: exp() }, 'list', {});
  await check('unattributed denials alert no one (no forged actor)', async () => assert.equal((await sql`SELECT count(*)::int n FROM public.account_notifications`)[0].n, before));
  await sql`DELETE FROM auth.sessions WHERE id=${mallory.sid}`;
  await as(mallory, 'list', {}); await as(mallory, 'list', {});
  await check('ended-session use alerts holder once (coalesced)', async () => { const n = await sql`SELECT kind,occurrences FROM public.account_notifications WHERE recipient_id=${mallory.id}`; assert.deepEqual(n.map(x => [x.kind, x.occurrences]), [['own_session_denied', 2]]); });
  await check('ended-session use alerts administrator', async () => { const n = await sql`SELECT kind FROM public.account_notifications WHERE recipient_id=${ADMIN} AND subject_id=${mallory.id}`; assert.deepEqual(n.map(x => x.kind), ['account_session_denied']); });
  await check('admin reads own alerts through boundary', async () => { const r = await call({ sub: ADMIN, session_id: sessions[5], exp: exp() }, 'notifications', {}); assert.equal(r.status, 200); assert.ok(r.data.some(n => n.kind === 'account_sign_in' && n.subject_id === bob.id)); });
  await check('demoted administrator loses access to existing admin alerts', async () => {
    const admin = { id: ADMIN, sid: sessions[5] };
    const old = (await notes(admin)).find(n => n.kind === 'account_sign_in');
    assert.ok(old);
    await signIn(admin);
    await sql`UPDATE public.user_roles SET role='viewer' WHERE user_id=${ADMIN}`;
    try {
      assert.ok((await notes(admin)).some(n => n.kind === 'own_sign_in'));
      assert.ok((await notes(admin)).every(n => n.subject_id === ADMIN));
      assert.equal((await as(admin, 'notifications_read', { id: old.id })).status, 404);
      await as(admin, 'notifications_read', {});
      assert.equal((await sql`SELECT read_at FROM public.account_notifications WHERE id=${old.id}`)[0].read_at, null);
    } finally {
      await sql`UPDATE public.user_roles SET role='administrator' WHERE user_id=${ADMIN}`;
    }
  });
  // Mutant: drop the recipient filter -> isolation check must fail.
  const [{ ndef }] = await sql`SELECT pg_get_functiondef('public.tv_notifications(text,jsonb)'::regprocedure) ndef`;
  const nm = ndef.replace('WHERE recipient_id=caller.actor', 'WHERE true'); assert.notEqual(nm, ndef);
  await sql.unsafe(nm); let nkilled = false; try { assert.deepEqual(await notes(alice), []); } catch { nkilled = true; }
  await sql.unsafe(ndef); await sql.unsafe('REVOKE ALL ON FUNCTION public.tv_notifications(text,jsonb) FROM PUBLIC,anon,authenticated,service_role');
  await check('mutant without recipient filter killed', () => assert.equal(nkilled, true)); mutantsKilled.push('notification recipient filter');
  // Alerts must never block sign-in.
  await sql.unsafe(`CREATE FUNCTION public.test_fail_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced'; END $$; CREATE TRIGGER test_fail_notify BEFORE INSERT OR UPDATE ON public.account_notifications FOR EACH ROW EXECUTE FUNCTION public.test_fail_notify();`);
  await check('alert failure does not block sign-in', async () => { await signIn(alice); assert.notEqual((await sql`SELECT last_sign_in_at FROM auth.users WHERE id=${alice.id}`)[0].last_sign_in_at, null); });
  await check('alert failure preserves denied access audit', async () => {
    const r = await as(mallory, 'list', {});
    assert.equal(r.status, 401);
    const event = await auditOf(r.request_id);
    assert.equal(event.actor_id, mallory.id);
    assert.equal(event.outcome, 'denied');
  });
  await sql.unsafe('DROP TRIGGER test_fail_notify ON public.account_notifications; DROP FUNCTION public.test_fail_notify();');
  return { checks, mutantsKilled: mutantsKilled.length };
}
