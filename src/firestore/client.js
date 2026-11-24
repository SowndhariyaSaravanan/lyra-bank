// Minimal Firestore REST client following Banking_Firestore_API_Test_Guide.docx:
//   GET list/get, POST ?documentId=, PATCH ?updateMask.fieldPaths=, DELETE, POST {base}:runQuery.
// The Authorization header (Firebase ID token) is only ever sent to firestore.googleapis.com.
import { REQUEST_TIMEOUT_MS } from '../firestore-config.js';
import { assertFieldName, decodeDocument, encodeFields, encodeValue, isValidCollection, isValidDocumentId } from './values.js';

const BASE_PATTERN = /^https:\/\/firestore\.googleapis\.com\/v1\/projects\/[a-z][a-z0-9-]*[a-z0-9]\/databases\/(\(default\)|[a-z][a-z0-9-]*)\/documents$/;
const QUERY_OPS = new Set(['EQUAL', 'NOT_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'IN', 'ARRAY_CONTAINS']);

export const baseUrlState = url => {
  if (!url || /REPLACE_/i.test(url)) return 'placeholder';
  return BASE_PATTERN.test(url) ? 'ok' : 'invalid';
};
export const projectOf = url => url?.match(/\/projects\/([^/]+)\//)?.[1] || '';

export class FirestoreError extends Error {
  constructor(message, { kind, httpStatus, status } = {}) {
    super(message);
    this.name = 'FirestoreError';
    this.kind = kind || 'unknown';
    this.httpStatus = httpStatus;
    this.status = status;
  }
}

const kindOf = (httpStatus, status) => {
  if (status === 'UNAUTHENTICATED' || httpStatus === 401) return 'auth';
  if (status === 'PERMISSION_DENIED' || httpStatus === 403) return 'denied';
  if (status === 'NOT_FOUND' || httpStatus === 404) return 'not_found';
  if (status === 'ALREADY_EXISTS' || httpStatus === 409) return 'exists';
  if (status === 'FAILED_PRECONDITION' || httpStatus === 412) return 'precondition';
  if (status === 'RESOURCE_EXHAUSTED' || httpStatus === 429) return 'quota';
  if (status === 'INVALID_ARGUMENT' || httpStatus === 400) return 'invalid';
  return httpStatus >= 500 ? 'server' : 'unknown';
};
const messages = {
  auth: 'Firestore rejected the sign-in token (missing, expired or for another project). Paste a fresh Firebase ID token in Data access.',
  denied: 'Firestore security rules denied this request. With the deny-all rules from the design, every browser request is denied by design.',
  not_found: 'The document or collection was not found.',
  exists: 'A document with this ID already exists.',
  precondition: 'Firestore could not apply this request (missing index or the document state changed).',
  quota: 'Firestore is rate limiting requests. Wait a moment and retry.',
  invalid: 'Firestore rejected the request as invalid.',
  server: 'Firestore is temporarily unavailable. Retry shortly.',
};

export function createFirestoreClient({ baseUrl, getToken, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));

  function root() {
    const state = baseUrlState(baseUrl);
    if (state === 'placeholder') throw new FirestoreError('This Firestore base URL is still a placeholder. Edit src/firestore-config.js.', { kind: 'config' });
    if (state === 'invalid') throw new FirestoreError('This Firestore base URL is not a valid https://firestore.googleapis.com/v1/projects/…/documents URL.', { kind: 'config' });
    return baseUrl;
  }

  function docPath(collection, id) {
    if (!isValidCollection(collection)) throw new Error('Invalid collection name.');
    if (id === undefined) return root() + '/' + collection;
    if (!isValidDocumentId(id)) throw new Error('Invalid document ID.');
    return root() + '/' + collection + '/' + encodeURIComponent(id);
  }

  async function request(method, url, { body, signal, write = false } = {}) {
    const headers = new Headers({ Accept: 'application/json' });
    const token = getToken?.();
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      response = await doFetch(url, {
        method, headers, signal: combined, redirect: 'error', credentials: 'omit', cache: 'no-store',
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeout.aborted) {
        throw new FirestoreError(write ? 'The request timed out. The change may or may not have been saved; reload before retrying.'
          : 'The request timed out. Retry.', { kind: 'timeout' });
      }
      throw new FirestoreError('Could not reach Firestore. Check your connection and the base URL.', { kind: 'network' });
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = result?.error?.status;
      const kind = kindOf(response.status, status);
      const detail = result?.error?.message ? ' (' + String(result.error.message).slice(0, 160) + ')' : '';
      throw new FirestoreError((messages[kind] || 'Firestore returned HTTP ' + response.status + '.') + detail, { kind, httpStatus: response.status, status });
    }
    return result;
  }

  return {
    // GET {base}/{collection}?pageSize=&pageToken=  -> { documents, nextPageToken }
    async list(collection, { pageSize = 100, pageToken, signal } = {}) {
      const params = new URLSearchParams({ pageSize: String(Math.min(Math.max(1, Math.trunc(pageSize) || 100), 300)) });
      if (pageToken) params.set('pageToken', pageToken);
      const result = await request('GET', docPath(collection) + '?' + params, { signal });
      return { documents: (result.documents || []).map(decodeDocument), nextPageToken: result.nextPageToken || null };
    },
    // Follows nextPageToken up to maxPages.
    async listAll(collection, { pageSize = 100, maxPages = 10, signal } = {}) {
      const documents = [];
      let pageToken;
      for (let page = 0; page < maxPages; page++) {
        const result = await this.list(collection, { pageSize, pageToken, signal });
        documents.push(...result.documents);
        pageToken = result.nextPageToken;
        if (!pageToken) return { documents, truncated: false };
      }
      return { documents, truncated: true };
    },
    // GET {base}/{collection}/{id}
    async get(collection, id, { signal } = {}) {
      return decodeDocument(await request('GET', docPath(collection, id), { signal }));
    },
    // POST {base}/{collection}?documentId={id}   (409 if it already exists)
    async create(collection, id, data, { signal } = {}) {
      if (!isValidDocumentId(id)) throw new Error('Invalid document ID.');
      const url = docPath(collection) + '?' + new URLSearchParams({ documentId: id });
      return decodeDocument(await request('POST', url, { body: { fields: encodeFields(data) }, signal, write: true }));
    },
    // PATCH {base}/{collection}/{id}?updateMask.fieldPaths=a&updateMask.fieldPaths=b
    // mustExist adds currentDocument.exists=true because a bare PATCH would create a missing document.
    async patch(collection, id, data, { mustExist = true, signal } = {}) {
      const keys = Object.keys(data).map(assertFieldName);
      if (!keys.length) throw new Error('Nothing to update.');
      const params = new URLSearchParams();
      keys.forEach(key => params.append('updateMask.fieldPaths', key));
      if (mustExist) params.set('currentDocument.exists', 'true');
      return decodeDocument(await request('PATCH', docPath(collection, id) + '?' + params, { body: { fields: encodeFields(data) }, signal, write: true }));
    },
    // DELETE {base}/{collection}/{id} -> {}
    async remove(collection, id, { signal } = {}) {
      await request('DELETE', docPath(collection, id), { signal, write: true });
      return true;
    },
    // POST {base}:runQuery with a structuredQuery (field filters ANDed together).
    async query({ collection, where = [], limit = 100, signal }) {
      if (!isValidCollection(collection)) throw new Error('Invalid collection name.');
      const filters = where.map(([field, op, value]) => {
        if (!QUERY_OPS.has(op)) throw new Error('Unsupported query operator: ' + op);
        return { fieldFilter: { field: { fieldPath: assertFieldName(field) }, op, value: encodeValue(value) } };
      });
      const structuredQuery = { from: [{ collectionId: collection }], limit: Math.min(Math.max(1, Math.trunc(limit) || 100), 300) };
      if (filters.length === 1) structuredQuery.where = filters[0];
      if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters } };
      const result = await request('POST', root() + ':runQuery', { body: { structuredQuery }, signal });
      const documents = (Array.isArray(result) ? result : []).filter(entry => entry.document).map(entry => decodeDocument(entry.document));
      return { documents, truncated: documents.length >= structuredQuery.limit };
    },
  };
}
