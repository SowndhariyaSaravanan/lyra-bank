// Customer modules backed by the bank's own Firestore (documented collections only).
import { useState } from 'react';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material';
import { Building2, Landmark, List, Wallet } from 'lucide-react';
import { toPaise } from '../ledger';
import { validateBeneficiary } from '../firestore/api.js';
import { usePortal } from './PortalContext.jsx';
import { FsError, Gate, Loading, PageHeading, money, useLoad, when } from './ui.jsx';

const bankName = (directory, id) => directory.find(item => item.bankId === id)?.bankName || id || '—';
const Empty = ({ Icon = List, title, text }) => <div className="empty"><Icon size={24} /><strong>{title}</strong>{text && <p>{text}</p>}</div>;
const statusChip = status => <Chip size="small" label={status || '—'} className={'status-chip st-' + String(status || '').toLowerCase()} />;

export function Beneficiaries({ directory, goto }) {
  return <div className="view-stack"><PageHeading title="Your" accent="payees" sub="Saved recipients, stored in your bank’s Firestore." sticker="Money meets people" />
    <Gate goto={goto}><BeneficiariesBody directory={directory} /></Gate></div>;
}

function BeneficiariesBody({ directory }) {
  const { individual, session } = usePortal();
  const [list, reload] = useLoad(signal => individual.listBeneficiaries(session.uid, signal), [session.uid]);
  const [nickname, setNickname] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [removing, setRemoving] = useState(null);
  const banks = directory.filter(item => item.status === 'ACTIVE');
  const rows = list.data?.documents || [];

  async function submit(event) {
    event.preventDefault();
    setError(''); setDone('');
    const code = ifsc || '';
    const problem = validateBeneficiary({ nickname, ifsc: code, accountNumber: number });
    if (problem) { setError(problem); return; }
    if (rows.some(row => row.beneficiaryIfsc === code && row.beneficiaryAccountNumber === number.trim())) { setError('This payee is already saved.'); return; }
    const bank = banks.find(item => item.ifsc === code);
    setBusy(true);
    try {
      const saved = await individual.createBeneficiary(session.uid, { nickname, bankId: bank?.bankId, ifsc: code, accountNumber: number });
      setDone('Payee saved (' + saved.id + ').');
      setNickname(''); setNumber('');
      reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    const target = removing;
    setRemoving(null); setError(''); setDone('');
    try { await individual.deleteBeneficiary(target.id); setDone('Payee removed.'); reload(); }
    catch (failure) { setError(failure.message); }
  }

  return <>
    <section className="panel"><header className="panel-head"><div><h2>Add a payee</h2><p>Only active banks from the shared directory can be chosen.</p></div></header>
      <form className="transfer-form" onSubmit={submit} noValidate>
        <TextField label="Nickname" required value={nickname} onChange={e => setNickname(e.target.value)} disabled={busy} slotProps={{ htmlInput: { maxLength: 40 } }} />
        <TextField select label="Bank" required value={ifsc} onChange={e => setIfsc(e.target.value)} disabled={busy || !banks.length}
          helperText={banks.length ? ' ' : 'The bank directory has not loaded any active banks yet.'}>
          {banks.map(item => <MenuItem key={item.ifsc} value={item.ifsc}>{item.bankName} · {item.ifsc}</MenuItem>)}
        </TextField>
        <TextField label="Account number" required value={number} onChange={e => setNumber(e.target.value)} disabled={busy} slotProps={{ htmlInput: { maxLength: 24 } }} />
        {error && <Alert severity="error">{error}</Alert>}
        {done && <Alert severity="success">{done}</Alert>}
        <div><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'Save payee'}</Button></div>
      </form></section>
    <section className="panel"><header className="panel-head"><div><h2>Saved payees</h2><p>{list.status === 'ready' ? rows.length + (rows.length === 1 ? ' payee' : ' payees') : ' '}</p></div></header>
      {list.status === 'loading' && <Loading />}
      {list.status === 'error' && <div style={{ padding: '0 20px 20px' }}><FsError error={list.error} onRetry={reload} /></div>}
      {list.status === 'ready' && (rows.length ? <div className="table-scroll"><table><thead><tr><th>Nickname</th><th>Bank</th><th>IFSC</th><th>Account</th><th>Added</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.nickname || '—'}</strong></td><td>{bankName(directory, row.beneficiaryBankId)}</td>
          <td className="mono">{row.beneficiaryIfsc}</td><td className="mono">{row.beneficiaryAccountNumber}</td><td>{when(row.createdAt)}</td>
          <td><Button size="small" variant="outlined" onClick={() => setRemoving(row)} aria-label={'Remove payee ' + (row.nickname || row.id)}>Remove</Button></td></tr>)}</tbody></table></div>
        : <Empty Icon={Building2} title="No payees yet" text="Add a recipient above to see them here." />)}
    </section>
    <Dialog open={Boolean(removing)} onClose={() => setRemoving(null)}><DialogTitle>Remove this payee?</DialogTitle>
      <DialogContent>{removing?.nickname} · {removing?.beneficiaryAccountNumber}. This deletes the saved payee only.</DialogContent>
      <DialogActions><Button onClick={() => setRemoving(null)}>Cancel</Button><Button variant="contained" onClick={remove}>Remove</Button></DialogActions></Dialog>
  </>;
}

export function Loans({ accounts, goto }) {
  return <div className="view-stack"><PageHeading title="Borrow" accent="smart" sub="Apply for a loan and track your requests." sticker="Small steps, big freedom" />
    <Gate goto={goto}><LoansBody accounts={accounts} /></Gate></div>;
}

function LoansBody({ accounts }) {
  const { individual, session } = usePortal();
  const [list, reload] = useLoad(signal => individual.listLoans(session.uid, signal), [session.uid]);
  const active = accounts.filter(item => item.status === 'ACTIVE');
  const [account, setAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const accountId = active.some(item => item.accountId === account) ? account : (active[0]?.accountId || '');
  const rows = [...(list.data?.documents || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  async function submit(event) {
    event.preventDefault();
    setError(''); setDone('');
    const requestedMinor = toPaise(amount);
    if (!accountId || requestedMinor === null) { setError('Choose an account and enter a positive amount with at most two decimals.'); return; }
    setBusy(true);
    try {
      const saved = await individual.applyLoan(session.uid, { accountId, requestedMinor });
      setDone('Loan request submitted (' + saved.id + '). It stays Pending until the bank reviews it.');
      setAmount('');
      reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <>
    <section className="panel"><header className="panel-head"><div><h2>Apply for a loan</h2><p>Creates a request with status PENDING. Approval is handled by the bank.</p></div></header>
      <form className="transfer-form" onSubmit={submit} noValidate>
        <TextField select label="Account" required value={accountId} onChange={e => setAccount(e.target.value)} disabled={busy || !active.length}
          helperText={active.length ? ' ' : 'No active account is available.'}>
          {active.map(item => <MenuItem key={item.accountId} value={item.accountId}>{item.accountNumber}</MenuItem>)}</TextField>
        <TextField label="Amount in INR" required value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        {error && <Alert severity="error">{error}</Alert>}
        {done && <Alert severity="success">{done}</Alert>}
        <div><Button type="submit" variant="contained" disabled={busy || !accountId}>{busy ? 'Submitting…' : 'Submit request'}</Button></div>
      </form></section>
    <section className="panel"><header className="panel-head"><div><h2>Your loan requests</h2></div></header>
      {list.status === 'loading' && <Loading />}
      {list.status === 'error' && <div style={{ padding: '0 20px 20px' }}><FsError error={list.error} onRetry={reload} /></div>}
      {list.status === 'ready' && (rows.length ? <div className="table-scroll"><table><thead><tr><th>Request</th><th>Account</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td><strong className="mono">{row.id}</strong><small>{when(row.createdAt)}</small></td><td className="mono">{row.accountId}</td>
          <td className="amount">{money(row.requestedMinor)}</td><td>{statusChip(row.status)}</td></tr>)}</tbody></table></div>
        : <Empty Icon={Wallet} title="No loan requests" text="Requests you submit will appear here." />)}
    </section>
  </>;
}

export function Portfolio({ accounts, goto }) {
  return <div className="view-stack"><PageHeading title="Your" accent="portfolio" sub="Accounts and loan requests in one place." sticker="Money for a cooler you" />
    <Gate goto={goto}><PortfolioBody accounts={accounts} /></Gate></div>;
}

function PortfolioBody({ accounts }) {
  const { individual, session } = usePortal();
  const [state, reload] = useLoad(async signal => {
    const [portfolio, loans] = await Promise.all([
      individual.getPortfolio(session.uid, signal).catch(error => { if (error.kind === 'not_found') return null; throw error; }),
      individual.listLoans(session.uid, signal),
    ]);
    return { portfolio, loans: loans.documents };
  }, [session.uid]);
  if (state.status === 'loading') return <section className="panel"><Loading /></section>;
  if (state.status === 'error') return <FsError error={state.error} onRetry={reload} />;
  const { portfolio, loans } = state.data;
  const available = accounts.reduce((sum, item) => sum + item.availableMinor, 0);
  const requested = loans.reduce((sum, item) => sum + (Number.isSafeInteger(item.requestedMinor) ? item.requestedMinor : 0), 0);
  return <>
    <div className="stat-grid">
      <div className="stat lime"><span>Total available</span><strong>{money(available)}</strong><small>{accounts.length} account(s), from your dashboard</small></div>
      <div className="stat purple"><span>Loan requests</span><strong>{loans.length}</strong><small>Total requested {money(requested)}</small></div>
    </div>
    <section className="panel"><header className="panel-head"><div><h2>Portfolio record</h2></div><Landmark size={20} /></header>
      {portfolio ? <dl className="bank-details"><dt>Account IDs</dt><dd>{(portfolio.accountIds || []).join(', ') || '—'}</dd>
        <dt>Loan IDs</dt><dd>{(portfolio.loanIds || []).join(', ') || '—'}</dd><dt>Last updated</dt><dd>{when(portfolio.updateTime)}</dd></dl>
        : <Empty title="No portfolio record yet" text="The bank has not created a portfolios document for you. The figures above come from your accounts and loan requests." />}
    </section>
  </>;
}

export function Statement({ accounts, goto }) {
  return <div className="view-stack"><PageHeading title="Account" accent="ledger" sub="Posted debit and credit entries for an account." sticker="Your money, your rules" />
    <Gate goto={goto}><StatementBody accounts={accounts} /></Gate></div>;
}

function StatementBody({ accounts }) {
  const { individual } = usePortal();
  const [selected, setSelected] = useState('');
  const accountId = accounts.some(item => item.accountId === selected) ? selected : (accounts[0]?.accountId || '');
  const [state, reload] = useLoad(signal => individual.listLedger(accountId, signal), [accountId], Boolean(accountId));
  const rows = [...(state.data?.documents || [])].sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)));
  if (!accounts.length) return <section className="panel"><Empty Icon={Wallet} title="No accounts" text="Ledger entries belong to an account." /></section>;
  return <section className="panel"><header className="panel-head"><div><h2>Ledger entries</h2><p>Up to 50 entries, newest first (sorted in your browser).</p></div></header>
    <div className="tool-row"><TextField size="small" select label="Account" value={accountId} onChange={e => setSelected(e.target.value)}>
      {accounts.map(item => <MenuItem key={item.accountId} value={item.accountId}>{item.accountNumber}</MenuItem>)}</TextField></div>
    {state.status === 'loading' && <Loading />}
    {state.status === 'error' && <div style={{ padding: '0 20px 20px' }}><FsError error={state.error} onRetry={reload} /></div>}
    {state.status === 'ready' && (rows.length ? <div className="table-scroll"><table><thead><tr><th>Posted</th><th>Direction</th><th>Amount</th><th>Transfer</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><td>{when(row.postedAt)}<small>{row.entryType || ''}</small></td>
        <td><Chip size="small" label={row.direction || '—'} className={row.direction === 'CREDIT' ? 'status-chip st-credit' : 'status-chip'} /></td>
        <td className={row.direction === 'CREDIT' ? 'incoming amount' : 'amount'}>{money(row.amountMinor)}</td><td className="mono">{row.transferId || '—'}</td></tr>)}</tbody></table></div>
      : <Empty title="No ledger entries" text="Nothing has been posted to this account yet." />)}
  </section>;
}

export function Kyc({ goto }) {
  return <div className="view-stack"><PageHeading title="Your" accent="KYC" sub="Status of your account application." sticker="Start your journey" />
    <Gate goto={goto}><KycBody /></Gate></div>;
}

function KycBody() {
  const { individual, session } = usePortal();
  const [state, reload] = useLoad(signal => individual.listOwnKyc(session.uid, signal), [session.uid]);
  const rows = state.data?.documents || [];
  return <>
    <Alert severity="info">Submitting a new application needs file upload to private storage and server-side registration, which this page cannot do securely. This page only shows existing requests.</Alert>
    <section className="panel"><header className="panel-head"><div><h2>KYC requests</h2></div></header>
      {state.status === 'loading' && <Loading />}
      {state.status === 'error' && <div style={{ padding: '0 20px 20px' }}><FsError error={state.error} onRetry={reload} /></div>}
      {state.status === 'ready' && (rows.length ? <div className="table-scroll"><table><thead><tr><th>Request</th><th>Opening deposit</th><th>Documents</th><th>Status</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td><strong className="mono">{row.id}</strong><small>{when(row.createdAt)}</small></td>
          <td>{money(row.openingDepositMinor || 0)}</td><td>{(row.documentPaths || []).length}</td><td>{statusChip(row.status)}</td></tr>)}</tbody></table></div>
        : <Empty title="No KYC requests" text="No application is linked to your sign-in." />)}
    </section>
  </>;
}
