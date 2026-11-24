import { useState } from 'react';
import { Alert, Button, Chip, TextField } from '@mui/material';
import { Building2, Globe2 } from 'lucide-react';
import {
  INDIVIDUAL_FIRESTORE_BASE_URL, LYRA_BANK, SHARED_FIRESTORE_BASE_URL, USE_SIGN_IN_TOKEN_FOR_INDIVIDUAL_DB,
} from '../firestore-config.js';
import { projectOf } from '../firestore/client.js';
import { usePortal } from './PortalContext.jsx';
import { FsError, Gate, Loading, PageHeading, when } from './ui.jsx';

const jwtShape = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const stateLabel = { ok: 'Configured', placeholder: 'Placeholder, not configured', invalid: 'Invalid URL' };

function TokenField({ label, value, onApply, help }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  function apply(event) {
    event.preventDefault();
    const token = text.trim();
    if (!jwtShape.test(token)) { setError('That does not look like a Firebase ID token (three dot-separated parts).'); return; }
    setError(''); onApply(token); setText('');
  }
  return <form className="transfer-form" onSubmit={apply} noValidate>
    <TextField label={label} type="password" autoComplete="off" value={text} onChange={e => setText(e.target.value)} helperText={help}
      error={Boolean(error)} slotProps={{ htmlInput: { spellCheck: false } }} />
    {error && <Alert severity="error">{error}</Alert>}
    <div className="tool-row" style={{ padding: 0 }}>
      <Button type="submit" variant="contained" disabled={!text.trim()}>Use token</Button>
      <Button variant="outlined" disabled={!value} onClick={() => onApply('')}>Clear token</Button>
      <Chip size="small" className={value ? 'status-chip st-active' : 'status-chip'} label={value ? 'Token in memory' : 'No token'} />
    </div>
  </form>;
}

function SharedExplorer() {
  const { shared, sharedToken, setSharedToken } = usePortal();
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(null);
  const [mode, setMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ifsc, setIfsc] = useState('');
  const [found, setFound] = useState(null);

  async function run(kind, token) {
    setBusy(true); setError(null); if (kind !== 'ifsc') setFound(null);
    try {
      if (kind === 'active') { const result = await shared.listActiveBanks(); setRows(result.documents); setNext(null); }
      else if (kind === 'ifsc') { setFound(await shared.resolveIfsc(ifsc.trim().toUpperCase())); }
      else { const page = await shared.listBanks({ pageToken: token }); setRows(current => (token ? [...current, ...page.documents] : page.documents)); setNext(page.nextPageToken); }
      if (kind !== 'ifsc') setMode(kind);
    } catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  return <section className="panel"><header className="panel-head"><div><h2>Shared directory (read-only)</h2>
    <p>Direct reads of banks and ifsc_registry. The shared project is normally readable only by bank backends through IAM, so a browser request is expected to be denied unless you publish read rules for it.</p></div><Globe2 size={20} /></header>
    <Gate need="shared"><div style={{ display: 'grid', gap: 14 }}>
      <TokenField label="Firebase ID token for the shared project (optional)" value={sharedToken} onApply={setSharedToken} help="Memory only. Tokens are per Firebase project." />
      <div className="tool-row">
        <Button variant="outlined" disabled={busy} onClick={() => run('all')}>List banks</Button>
        <Button variant="outlined" disabled={busy} onClick={() => run('active')}>Active banks (runQuery)</Button>
        <TextField size="small" label="Resolve IFSC" value={ifsc} onChange={e => setIfsc(e.target.value)} slotProps={{ htmlInput: { maxLength: 11 } }} />
        <Button variant="outlined" disabled={busy || ifsc.trim().length !== 11} onClick={() => run('ifsc')}>Resolve</Button>
      </div>
      {busy && <Loading />}
      {error && <div style={{ padding: '0 20px' }}><FsError error={error} /></div>}
      {found && <Alert className="lookup-result" severity={found.bank.status === 'ACTIVE' ? 'success' : 'warning'}>{found.bank.bankName} ({found.mapping.bankId}) · {found.bank.status}</Alert>}
      {mode && !busy && (rows.length ? <div className="table-scroll"><table><thead><tr><th>Bank</th><th>Bank ID</th><th>IFSC</th><th>Status</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.bankName}</strong></td><td className="mono">{row.bankId || row.id}</td><td className="mono">{row.ifsc}</td><td>{row.status}</td></tr>)}</tbody></table></div>
        : <div className="empty"><Building2 size={22} /><strong>No banks returned</strong></div>)}
      {next && <div className="tool-row"><Button variant="outlined" disabled={busy} onClick={() => run('all', next)}>Load more</Button></div>}
    </div></Gate></section>;
}

export function DataAccess() {
  const { configured, individual, idToken, setIdToken, profile, loadProfile, hasAuth, session } = usePortal();
  const [test, setTest] = useState({ status: 'idle' });
  async function runTest() {
    setTest({ status: 'loading' });
    try { const doc = await individual.getSettingsIdentity(); setTest({ status: 'ok', doc }); }
    catch (error) { setTest({ status: 'error', error }); }
  }
  return <div className="view-stack"><PageHeading title="Data" accent="access" sub="Connect this portal to your Firestore projects." sticker="Secure by design" />
    <section className="panel"><header className="panel-head"><div><h2>Configuration</h2><p>Set in src/firestore-config.js, the only file with Firestore URLs.</p></div></header>
      <div className="table-scroll"><table><thead><tr><th>Database</th><th>Project</th><th>Status</th></tr></thead><tbody>
        <tr><td><strong>Individual ({LYRA_BANK.name}, {LYRA_BANK.bankId})</strong><small>INDIVIDUAL_FIRESTORE_BASE_URL</small></td><td className="mono">{projectOf(INDIVIDUAL_FIRESTORE_BASE_URL)}</td><td>{stateLabel[configured.individual]}</td></tr>
        <tr><td><strong>Shared directory</strong><small>SHARED_FIRESTORE_BASE_URL</small></td><td className="mono">{projectOf(SHARED_FIRESTORE_BASE_URL)}</td><td>{stateLabel[configured.shared]}</td></tr></tbody></table></div></section>
    <section className="panel"><header className="panel-head"><div><h2>Sign-in token for Firestore</h2>
      <p>Firestore needs a Firebase Auth ID token for the Lyra project. Never paste a service-account key or an OAuth access token here.</p></div></header>
      {USE_SIGN_IN_TOKEN_FOR_INDIVIDUAL_DB
        ? <Alert severity="warning" className="lookup-result">The configuration file sends the Worker sign-in token to Firestore. Turn that off if it is not a Firebase ID token.</Alert>
        : <TokenField label="Firebase ID token (Lyra project)" value={idToken} onApply={setIdToken} help="Kept in memory only; cleared on sign-out or reload. ID tokens expire after about an hour." />}
    </section>
    <section className="panel"><header className="panel-head"><div><h2>Connection check</h2><p>Reads bank_settings/identity with your token. Nothing is written.</p></div></header>
      <div className="tool-row"><Button variant="contained" onClick={runTest} disabled={configured.individual !== 'ok' || !hasAuth || test.status === 'loading'}>Run check</Button></div>
      <div style={{ padding: '0 20px 20px', display: 'grid', gap: 12 }}>
        {test.status === 'loading' && <Loading />}
        {test.status === 'ok' && <Alert severity="success">Firestore answered. Document {test.doc.id}, updated {when(test.doc.updateTime)}.</Alert>}
        {test.status === 'error' && <FsError error={test.error} />}
        <strong>Your role</strong>
        {profile.status === 'idle' && <p className="available">Not read yet. It loads automatically once a token is available.</p>}
        {profile.status === 'loading' && <Loading label="Reading your user record…" />}
        {profile.status === 'error' && <FsError error={profile.error} onRetry={() => loadProfile()} />}
        {profile.status === 'ready' && <Alert severity="info">User {session?.uid}: role {String(profile.data.role)}, status {String(profile.data.status)}. Admin screens appear for an active ADMIN of {LYRA_BANK.bankId}. This only controls what is shown; Firestore rules decide what is allowed.</Alert>}
      </div></section>
    <SharedExplorer />
  </div>;
}

const rows = [
  ['Sign-in, dashboard, transfers (same-bank and interbank), bank directory', 'Live', 'Cloudflare Worker (existing, unchanged)', 'Existing'],
  ['Read own user profile; role used to show admin screens', 'Enabled', 'Firebase ID token + rules', 'users (passwordHash is never displayed)'],
  ['Beneficiaries: list, add, remove own', 'Enabled', 'Firebase ID token + rules', 'beneficiaries'],
  ['Loans: list and apply (status PENDING)', 'Enabled', 'Firebase ID token + rules', 'loans; approval has no documented API'],
  ['Portfolio, ledger entries, own KYC status (read)', 'Read-only', 'Firebase ID token + rules', 'portfolios, ledger_entries, kyc_requests'],
  ['Admin: KYC queue (read)', 'Read-only', 'ADMIN ID token + admin rules', 'kyc_requests'],
  ['Admin: transfer limits (set) with audit entry', 'Enabled', 'ADMIN ID token + admin rules', 'transfer_limits, audit_logs (audit is a second write)'],
  ['Admin: audit log and bank settings (read)', 'Read-only', 'ADMIN ID token + admin rules', 'audit_logs, bank_settings'],
  ['Shared banks / ifsc_registry (read)', 'Read-only', 'Normally IAM for bank backends; ID token only if you publish read rules', 'banks, ifsc_registry'],
  ['Registration (password hashing, UID issuance)', 'Backend only', 'Trusted backend', 'Argon2id hashing must never run or be stored from a browser'],
  ['KYC document upload', 'Backend only', 'Storage rules / backend', 'Cloud Storage is not part of the documented Firestore API'],
  ['KYC approve / hold / reject', 'Backend only', 'Trusted backend', 'Needs audit, email outbox and, on approval, account + one-time credit'],
  ['Balances, accounts, ledger writes, X42 debit/credit', 'Backend only', 'Trusted backend (X42)', 'A browser must never change money'],
  ['users, sessions, request_nonces, switch_nonces, idempotency_keys, interbank_inbox, daily_usage, notification_outbox writes', 'Backend only', 'Trusted backend', 'Identity, replay-protection and mail records'],
  ['Shared banks / ifsc_registry writes', 'Backend only', 'Central maintainer via IAM', 'Postman test writes (NOVA0A1B2C3) are not implemented'],
];

export function Coverage() {
  return <div className="view-stack"><PageHeading title="Security &" accent="coverage" sub="What runs where, and what credential each operation needs." sticker="No fake success" />
    <Alert severity="warning">With the deny-all Firestore rules from the design, every browser request above is denied by design (PERMISSION_DENIED). The Enabled and Read-only rows work only if you deliberately publish narrower rules for them. This project does not change your rules.</Alert>
    <section className="panel"><div className="table-scroll"><table><thead><tr><th>Operation</th><th>Status</th><th>Credential</th><th>Collections / note</th></tr></thead>
      <tbody>{rows.map(([name, status, credential, note]) => <tr key={name}><td style={{ whiteSpace: 'normal', minWidth: 260 }}><strong>{name}</strong></td>
        <td><Chip size="small" label={status} className={'status-chip ' + (status === 'Backend only' ? 'st-backend' : 'st-active')} /></td>
        <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{credential}</td><td style={{ whiteSpace: 'normal', minWidth: 220 }}>{note}</td></tr>)}</tbody></table></div></section>
  </div>;
}
