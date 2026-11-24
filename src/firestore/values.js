// Firestore REST typed-value helpers (stringValue, integerValue, timestampValue, ...).

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Never surface credential-like fields returned by Firestore to the UI.
const SENSITIVE_FIELDS = new Set(['passwordHash', 'csrfHash', 'sessionHash']);

export function assertFieldName(name) {
  if (!FIELD_NAME.test(name)) throw new Error('Invalid Firestore field name: ' + name);
  return name;
}

export function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Invalid date value.');
    return { timestampValue: value.toISOString() };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  switch (typeof value) {
    case 'string': return { stringValue: value };
    case 'boolean': return { booleanValue: value };
    case 'number':
      if (!Number.isFinite(value)) throw new Error('Numbers must be finite.');
      if (Number.isInteger(value)) {
        if (!Number.isSafeInteger(value)) throw new Error('Integer is too large to send safely.');
        return { integerValue: String(value) };
      }
      return { doubleValue: value };
    case 'object': return { mapValue: { fields: encodeFields(value) } };
    default: throw new Error('Unsupported value type: ' + typeof value);
  }
}

export function encodeFields(object) {
  const fields = {};
  for (const [key, value] of Object.entries(object)) fields[assertFieldName(key)] = encodeValue(value);
  return fields;
}

export function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) {
    const number = Number(value.integerValue);
    return Number.isSafeInteger(number) ? number : String(value.integerValue);
  }
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

export function decodeFields(fields = {}) {
  const output = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SENSITIVE_FIELDS.has(key)) output[key] = decodeValue(value);
  }
  return output;
}

// "projects/p/databases/(default)/documents/accounts/ACC001" -> { id: "ACC001", ...fields }
export function decodeDocument(doc) {
  const id = String(doc?.name || '').split('/').pop();
  return { ...decodeFields(doc?.fields), id, createTime: doc?.createTime, updateTime: doc?.updateTime };
}

export const isValidDocumentId = id => typeof id === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}$/.test(id) && id !== '.' && id !== '..';
export const isValidCollection = name => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(name);
