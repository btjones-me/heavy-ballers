import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Load the actual refresh helper without mounting a browser or calling an API.
const source = readFileSync(new URL('../components/DemoPhone.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const context = { exports: {}, require: () => ({}), console };
vm.runInNewContext(compiled, context);
const { refreshWithCurrentToken } = context.exports;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('late anonymous poll cannot turn a newly acquired owner into a spectator', async () => {
  let token = '', current = { active: false, owner: false };
  const pending = deferred(), published = [];
  const poll = refreshWithCurrentToken(() => token, requestToken => { assert.equal(requestToken, ''); return pending.promise; }, () => current, value => { current = value; published.push(value); });
  token = 'test-owner-token';
  current = { active: true, owner: true };
  pending.resolve({ active: true, owner: false });
  assert.equal(await poll, current);
  assert.equal(current.owner, true);
  assert.equal(published.length, 0);
});

test('current-token retry publishes owner state and permits the next scripted message', async () => {
  const token = 'test-owner-token'; let current = { active: true, owner: false }; let published = 0;
  const next = await refreshWithCurrentToken(() => token, async requestToken => { assert.equal(requestToken, token); return { active: true, owner: true }; }, () => current, value => { current = value; published++; });
  assert.equal(next.owner, true);
  assert.equal(current.owner, true);
  assert.equal(published, 1);
});

test('a stale-token failure does not replace current ownership with an error', async () => {
  let token = ''; const current = { active: true, owner: true }; const pending = deferred();
  const poll = refreshWithCurrentToken(() => token, () => pending.promise, () => current, () => assert.fail('Stale poll must not publish'));
  token = 'new-owner-token';
  pending.reject(new Error('Request failed'));
  assert.equal(await poll, current);
});

test('a current-token request failure still reaches the caller', async () => {
  await assert.rejects(refreshWithCurrentToken(() => 'same-token', async () => { throw new Error('Connection unavailable'); }, () => ({}), () => assert.fail('Failed poll must not publish')), /Connection unavailable/);
});
