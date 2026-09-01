// Run: npm run check -w server
//
// The tunnel is public, so this middleware is the only thing between a guessed
// hostname and a live interview. A regression here is silent.

import assert from 'node:assert';

process.env.ORCHESTRATOR_API_KEY = 'test-secret';
const { requireSecret } = await import('../routes/auth.js');

type Res = { code?: number; body?: unknown };
function run(header?: string): { res: Res; passed: boolean } {
  const res: Res = {};
  let passed = false;
  const fake = {
    status(c: number) { res.code = c; return this; },
    json(b: unknown) { res.body = b; return this; },
  };
  requireSecret(
    { get: () => header } as never,
    fake as never,
    () => { passed = true; },
  );
  return { res, passed };
}

assert.equal(run('Bearer test-secret').passed, true, 'the right secret must pass');
assert.equal(run('bearer test-secret').passed, true, 'the scheme is case-insensitive');
assert.equal(run().passed, false, 'a missing header must be refused');
assert.equal(run('Bearer wrong').passed, false, 'a wrong secret must be refused');
assert.equal(run('test-secret').passed, true, 'a bare token is accepted too');
assert.equal(run('Bearer ').passed, false, 'an empty token must never pass');
assert.equal(run().res.code, 401, 'refusals are 401');

// A server with no secret configured must refuse everything rather than run
// open — a missing key must never read as "allow".
delete process.env.ORCHESTRATOR_API_KEY;
const unset = run('Bearer anything');
assert.equal(unset.passed, false, 'an unconfigured server must not accept writes');
assert.equal(unset.res.code, 503, 'an unconfigured server says 503, not 401');

console.log('auth  right secret passes, everything else is refused');
console.log('      unconfigured server refuses with 503');
console.log('\nself-check passed');
