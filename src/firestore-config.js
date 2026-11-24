// ============================================================================
// FIRESTORE CONFIGURATION — the ONLY place Firestore URLs are defined.
// Every API module imports from this file. Do not write URLs anywhere else.
//
// Format (from Banking_Firestore_API_Test_Guide.docx):
//   https://firestore.googleapis.com/v1/projects/PROJECT_ID/databases/(default)/documents
// Use "(default)" unless your Firestore database has its own database ID.
// ============================================================================

// >>> REPLACE: Lyra Bank's own (individual) Firebase project ID.
export const INDIVIDUAL_FIRESTORE_BASE_URL =
  'https://firestore.googleapis.com/v1/projects/lyra-bank/databases/(default)/documents';

// >>> REPLACE: the central shared-directory Firebase project ID (banks, ifsc_registry).
export const SHARED_FIRESTORE_BASE_URL =
  'https://firestore.googleapis.com/v1/projects/sharedbank-connect/databases/(default)/documents';

// Lyra identity values (from the existing ledger.js bank record).
export const LYRA_BANK = Object.freeze({ bankId: 'P648', ifsc: 'SOWN0M9C5JQ', name: 'Lyra Bank' });

// AUTHENTICATION
// Firestore REST calls from the browser need a Firebase Auth ID token for THIS
// bank's Firebase project. Default (false): the user pastes an ID token in
// "Data access"; it is held in memory only.
// Set to true ONLY after you have verified that the Worker sign-in token is a
// Firebase ID token for the Lyra project. If it is not, that token would be
// sent to Google for no benefit. Never put service-account keys or OAuth
// access tokens anywhere in this frontend.
export const USE_SIGN_IN_TOKEN_FOR_INDIVIDUAL_DB = false;

export const REQUEST_TIMEOUT_MS = 15_000;
