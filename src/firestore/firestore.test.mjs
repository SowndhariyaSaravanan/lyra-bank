import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirestoreClient, baseUrlState, FirestoreError } from './client.js';
import { decodeDocument, encodeFields, decodeValue } from './values.js';
import { individualApi, validateBeneficiary } from './api.js';
import * as config from '../firestore-config.js';

const BASE = 'https://firestore.googleapis.com/v1/projects/lyra-test-123/databases/(default)/documents';
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function harness(responder, token = 'tok') {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, ...init }); return responder(url, init, calls.length); };
  return { calls, client: createFirestoreClient({ baseUrl: BASE, getToken: () => token, fetchImpl }) };
}

test('config exposes both clearly marked placeholders and no Nexus values', () => {
  assert.match(config.INDIVIDUAL_FIRESTORE_BASE_URL, /REPLACE_WITH_LYRA_PROJECT_ID/);
  assert.match(config.SHARED_FIRESTORE_BASE_URL, /REPLACE_WITH_SHARED_PROJECT_ID/);
  assert.equal(config.LYRA_BANK.bankId, 'P648');
  assert.equal(baseUrlState(config.INDIVIDUAL_FIRESTORE_BASE_URL), 'placeholder');
  assert.equal(baseUrlState(BASE), 'ok');
  assert.equal(baseUrlState('https://evil.example/v1/projects/x/databases/(default)/documents'), 'invalid');
});

test('typed values round-trip and match the documented shapes', () => {
  const fields = encodeFields({ a: 'x', n: 100000, t: true, z: null, arr: [], when: new Date('2026-11-23T00:00:00Z') });
  assert.deepEqual(fields.a, { stringValue: 'x' });
  assert.deepEqual(fields.n, { integerValue: '100000' });
  assert.deepEqual(fields.arr, { arrayValue: { values: [] } });
  assert.deepEqual(fields.when, { timestampValue: '2026-11-23T00:00:00.000Z' });
  assert.equal(decodeValue({ integerValue: '5' }), 5);
  assert.throws(() => encodeFields({ n: 2 ** 60 }));
  assert.throws(() => encodeFields({ 'bad key': 1 }));
});

test('decodeDocument takes the ID from the name and drops credential-like fields', () => {
  const doc = decodeDocument({ name: 'projects/p/databases/(default)/documents/users/u1',
    fields: { uid: { stringValue: 'u1' }, passwordHash: { stringValue: 'secret' } } });
  assert.equal(doc.id, 'u1');
  assert.equal(doc.passwordHash, undefined);
});

test('placeholder base URL never calls fetch', async () => {
  let called = false;
  const client = createFirestoreClient({ baseUrl: config.INDIVIDUAL_FIRESTORE_BASE_URL, fetchImpl: async () => { called = true; } });
  await assert.rejects(() => client.get('accounts', 'A1'), e => e instanceof FirestoreError && e.kind === 'config');
  assert.equal(called, false);
});

test('Authorization header is sent only when a token exists', async () => {
  const a = harness(() => json({ name: 'x/accounts/A1', fields: {} }), 'abc');
  await a.client.get('accounts', 'A1');
  assert.equal(a.calls[0].headers.get('Authorization'), 'Bearer abc');
  const b = harness(() => json({ name: 'x/accounts/A1', fields: {} }), '');
  await b.client.get('accounts', 'A1');
  assert.equal(b.calls[0].headers.has('Authorization'), false);
});

test('create uses POST ?documentId= ; patch uses update masks and exists precondition', async () => {
  const h = harness(() => json({ name: 'x/beneficiaries/B1', fields: {} }));
  await h.client.create('beneficiaries', 'B1', { uid: 'u1' });
  assert.equal(h.calls[0].method, 'POST');
  assert.equal(h.calls[0].url, BASE + '/beneficiaries?documentId=B1');
  await h.client.patch('transfer_limits', 'ACC1', { perTransferMinor: 5, dailyMinor: 9 });
  assert.equal(h.calls[1].method, 'PATCH');
  const url = new URL(h.calls[1].url);
  assert.deepEqual(url.searchParams.getAll('updateMask.fieldPaths'), ['perTransferMinor', 'dailyMinor']);
  assert.equal(url.searchParams.get('currentDocument.exists'), 'true');
  assert.deepEqual(JSON.parse(h.calls[1].body).fields.dailyMinor, { integerValue: '9' });
});

test('list follows nextPageToken and handles empty collections', async () => {
  const pages = [{ documents: [{ name: 'x/banks/A', fields: {} }], nextPageToken: 'n1' }, { documents: [{ name: 'x/banks/B', fields: {} }] }];
  const h = harness((url, init, n) => json(pages[n - 1]));
  const all = await h.client.listAll('banks', { pageSize: 1 });
  assert.deepEqual(all.documents.map(d => d.id), ['A', 'B']);
  assert.equal(new URL(h.calls[1].url).searchParams.get('pageToken'), 'n1');
  const empty = await harness(() => json({})).client.list('banks');
  assert.deepEqual(empty.documents, []);
});

test('runQuery posts a structuredQuery and ignores readTime-only entries', async () => {
  const h = harness(() => json([{ readTime: 't' }, { document: { name: 'x/accounts/A1', fields: { customerUid: { stringValue: 'u1' } } } }]));
  const result = await h.client.query({ collection: 'accounts', where: [['customerUid', 'EQUAL', 'u1']] });
  assert.equal(h.calls[0].url, BASE + ':runQuery');
  const body = JSON.parse(h.calls[0].body);
  assert.equal(body.structuredQuery.where.fieldFilter.op, 'EQUAL');
  assert.deepEqual(body.structuredQuery.from, [{ collectionId: 'accounts' }]);
  assert.equal(result.documents.length, 1);
  await assert.rejects(() => h.client.query({ collection: 'accounts', where: [['a', 'DROP', 1]] }));
});

test('HTTP errors map to clear kinds', async () => {
  for (const [status, body, kind] of [[403, { error: { status: 'PERMISSION_DENIED' } }, 'denied'], [401, { error: { status: 'UNAUTHENTICATED' } }, 'auth'],
    [404, { error: { status: 'NOT_FOUND' } }, 'not_found'], [409, { error: { status: 'ALREADY_EXISTS' } }, 'exists']]) {
    const { client } = harness(() => json(body, status));
    await assert.rejects(() => client.get('accounts', 'A1'), e => e.kind === kind);
  }
});

test('path-like IDs are rejected before any request', async () => {
  const h = harness(() => json({}));
  await assert.rejects(async () => h.client.get('accounts', '../users/x'));
  await assert.rejects(async () => h.client.get('acc/ounts', 'x'));
  assert.equal(h.calls.length, 0);
});

test('beneficiary and loan validation', async () => {
  assert.equal(validateBeneficiary({ nickname: 'Mum', ifsc: 'SOWN0M9C5JQ', accountNumber: 'LYRA000001' }), '');
  assert.notEqual(validateBeneficiary({ nickname: '', ifsc: 'SOWN0M9C5JQ', accountNumber: 'LYRA000001' }), '');
  assert.notEqual(validateBeneficiary({ nickname: 'x', ifsc: 'bad', accountNumber: 'LYRA000001' }), '');
  const h = harness(() => json({ name: 'x/loans/L', fields: {} }));
  const api = individualApi(h.client);
  await assert.rejects(() => api.applyLoan('u1', { accountId: 'A', requestedMinor: 0 }));
  await api.applyLoan('u1', { accountId: 'A', requestedMinor: 500000 });
  const body = JSON.parse(h.calls[0].body).fields;
  assert.deepEqual(body.status, { stringValue: 'PENDING' });
  assert.deepEqual(body.requestedMinor, { integerValue: '500000' });
});

test('setLimit creates when missing, patches when present, and reports audit failure honestly', async () => {
  const h = harness((url, init) => {
    if (init.method === 'GET') return json({ error: { status: 'NOT_FOUND' } }, 404);
    if (url.includes('/audit_logs')) return json({ error: { status: 'PERMISSION_DENIED' } }, 403);
    return json({ name: 'x/transfer_limits/ACC1', fields: {} });
  });
  const result = await individualApi(h.client).setLimit({ accountId: 'ACC1', perTransferMinor: 100, dailyMinor: 200, actorUid: 'admin1' });
  assert.equal(h.calls[1].method, 'POST');
  assert.equal(result.audit.ok, false);
  await assert.rejects(() => individualApi(h.client).setLimit({ accountId: 'ACC1', perTransferMinor: 300, dailyMinor: 200, actorUid: 'a' }));
});
