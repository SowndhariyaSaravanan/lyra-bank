// Lyra Bank data modules built on the documented Firestore collections.
// Only operations that are safe from a browser are implemented. Balances, ledger,
// users/passwords, sessions, nonces, outbox and KYC decisions are NOT writable here.
import { LYRA_BANK } from '../firestore-config.js';

const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const accountNumberPattern = /^[A-Za-z0-9]{6,24}$/;
const newId = prefix => prefix + '_' + crypto.randomUUID().replaceAll('-', '');

export const validateBeneficiary = ({ nickname, ifsc, accountNumber }) => {
  const name = String(nickname || '').trim();
  if (name.length < 1 || name.length > 40) return 'Enter a nickname of 1 to 40 characters.';
  if (!ifscPattern.test(String(ifsc || ''))) return 'Choose a bank with a valid IFSC.';
  if (!accountNumberPattern.test(String(accountNumber || '').trim())) return 'Account number must be 6 to 24 letters or digits.';
  return '';
};

export function individualApi(client) {
  const byUid = (collection, uid, signal) => client.query({ collection, where: [['uid', 'EQUAL', uid]], signal });
  return {
    getProfile: (uid, signal) => client.get('users', uid, { signal }),
    getSettingsIdentity: signal => client.get('bank_settings', 'identity', { signal }),
    listSettings: signal => client.list('bank_settings', { pageSize: 100, signal }),

    listBeneficiaries: (uid, signal) => byUid('beneficiaries', uid, signal),
    async createBeneficiary(uid, { nickname, bankId, ifsc, accountNumber }, signal) {
      const problem = validateBeneficiary({ nickname, ifsc, accountNumber });
      if (problem) throw new Error(problem);
      if (!bankId) throw new Error('The selected bank has no bank ID.');
      const id = newId('BEN');
      return client.create('beneficiaries', id, {
        uid, nickname: String(nickname).trim(), beneficiaryBankId: bankId, beneficiaryIfsc: ifsc,
        beneficiaryAccountNumber: String(accountNumber).trim(), createdAt: new Date(),
      }, { signal });
    },
    deleteBeneficiary: (id, signal) => client.remove('beneficiaries', id, { signal }),

    listLoans: (uid, signal) => byUid('loans', uid, signal),
    async applyLoan(uid, { accountId, requestedMinor }, signal) {
      if (!accountId) throw new Error('Choose an account.');
      if (!Number.isSafeInteger(requestedMinor) || requestedMinor <= 0) throw new Error('Enter a positive loan amount.');
      return client.create('loans', newId('LOAN'), { uid, accountId, requestedMinor, status: 'PENDING', createdAt: new Date() }, { signal });
    },

    getPortfolio: (uid, signal) => client.get('portfolios', uid, { signal }),
    listOwnKyc: (uid, signal) => byUid('kyc_requests', uid, signal),
    listLedger: (accountId, signal) => client.query({ collection: 'ledger_entries', where: [['accountId', 'EQUAL', accountId]], limit: 50, signal }),

    // ---- Admin (needs an ADMIN user's ID token AND matching security rules) ----
    listKyc: ({ status, pageToken, signal } = {}) => status
      ? client.query({ collection: 'kyc_requests', where: [['status', 'EQUAL', status]], signal }).then(r => ({ documents: r.documents, nextPageToken: null }))
      : client.list('kyc_requests', { pageSize: 50, pageToken, signal }),
    listAccountsForAdmin: (pageToken, signal) => client.list('accounts', { pageSize: 100, pageToken, signal }),
    async getLimit(accountId, signal) {
      try { return await client.get('transfer_limits', accountId, { signal }); }
      catch (error) { if (error.kind === 'not_found') return null; throw error; }
    },
    async setLimit({ accountId, perTransferMinor, dailyMinor, actorUid }, signal) {
      for (const value of [perTransferMinor, dailyMinor]) if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Limits must be positive amounts.');
      if (perTransferMinor > dailyMinor) throw new Error('The per-transfer limit cannot exceed the daily limit.');
      const existing = await this.getLimit(accountId, signal);
      const now = new Date();
      const change = { perTransferMinor, dailyMinor, updatedBy: actorUid, updatedAt: now };
      const limit = existing
        ? await client.patch('transfer_limits', accountId, change, { mustExist: true, signal })
        : await client.create('transfer_limits', accountId, { accountId, ...change }, { signal });
      // Best-effort audit entry: a second write, so it can fail independently of the limit change.
      const logid = newId('AUDIT');
      try {
        await client.create('audit_logs', logid, {
          logid, action: 'SET_TRANSFER_LIMIT', actor: actorUid, at: now, bankId: LYRA_BANK.bankId,
          description: 'Set limits for ' + accountId + ': per transfer ' + perTransferMinor + ', daily ' + dailyMinor + ' (minor units)',
        }, { signal });
        return { limit, audit: { ok: true, logid } };
      } catch (error) { return { limit, audit: { ok: false, error } }; }
    },
    listAudit: (pageToken, signal) => client.list('audit_logs', { pageSize: 50, pageToken, signal }),
  };
}

// Shared directory: READ-ONLY from the browser. Writes belong to the central maintainer via a trusted backend / IAM.
export function sharedApi(client) {
  return {
    listBanks: ({ pageToken, signal } = {}) => client.list('banks', { pageSize: 50, pageToken, signal }),
    getBank: (bankId, signal) => client.get('banks', bankId, { signal }),
    listActiveBanks: signal => client.query({ collection: 'banks', where: [['status', 'EQUAL', 'ACTIVE']], signal }),
    async resolveIfsc(ifsc, signal) {
      if (!ifscPattern.test(ifsc)) throw new Error('Enter a valid 11-character IFSC.');
      const mapping = await client.get('ifsc_registry', ifsc, { signal });
      const bank = await client.get('banks', mapping.bankId, { signal });
      return { mapping, bank };
    },
  };
}
