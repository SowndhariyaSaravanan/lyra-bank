// Admin modules. UI gating is convenience only: Firestore rules and the backend must enforce the ADMIN role.
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Tooltip } from '@mui/material';
import { List } from 'lucide-react';
import { toPaise } from '../ledger';
import { usePortal } from './PortalContext.jsx';
import { AdminOnly, FsError, Gate, Loading, PageHeading, money, useLoad, when } from './ui.jsx';

const Shell = ({ goto, children, ...heading }) => <div className="view-stack"><PageHeading {...heading} /><Gate goto={goto}><AdminOnly>{children}</AdminOnly></Gate></div>;
const Empty = ({ title, text }) => <div className="empty"><List size={24} /><strong>{title}</strong>{text && <p>{text}</p>}</div>;

function usePaged(loadPage, deps) {
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(null);
  const [state, setState] = useState({ status: 'loading', error: null });
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const seq = useRef(0);
  const run = async (token, replace) => {
    const mine = ++seq.current;
    setState(current => ({ ...current, status: replace ? 'loading' : current.status, error: null }));
    try {
      const page = await loadPage(token);
      if (mine !== seq.current) return;
      setRows(current => (replace ? page.documents : [...current, ...page.documents]));
      setNext(page.nextPageToken || null);
      setState({ status: 'ready', error: null });
    } catch (error) { if (mine === seq.current) setState({ status: 'error', error }); }
    finally { if (mine === seq.current) setMore(false); }
  };
  useEffect(() => { run(undefined, true); return () => { seq.current += 1; }; }, [...deps, tick]);
  return { rows, state, next, more, reload: () => setTick(v => v + 1), loadMore: () => { setMore(true); run(next, false); } };
}

export function AdminKyc({ goto }) {
  return <Shell goto={goto} title="KYC" accent="review" sub="Review queue for new customer applications." sticker="Admin"><KycBody /></Shell>;
}

function KycBody() {
  const { individual } = usePortal();
  const [filter, setFilter] = useState('PENDING');
  const status = filter === 'ALL' ? undefined : filter;
  const paged = usePaged(token => individual.listKyc({ status, pageToken: token }), [status]);
  const rows = paged.rows;
  const reason = 'Approve, hold and reject must also write the audit log and email event, and approval creates the account and the one-time demo credit. Those steps need trusted backend access.';
  return <>
    <Alert severity="info">Read-only queue. {reason}</Alert>
    <section className="panel"><header className="panel-head"><div><h2>Applications</h2></div></header>
      <div className="tool-row"><TextField size="small" select label="Status" value={filter} onChange={e => setFilter(e.target.value)}>
        {['PENDING', 'HOLD', 'REJECTED', 'APPROVED', 'DRAFT', 'ALL'].map(item => <MenuItem key={item} value={item}>{item === 'ALL' ? 'All (paged)' : item}</MenuItem>)}</TextField></div>
      {paged.state.status === 'loading' && <Loading />}
      {paged.state.status === 'error' && <div style={{ padding: '0 20px 20px' }}><FsError error={paged.state.error} onRetry={paged.reload} /></div>}
      {paged.state.status === 'ready' && (rows.length ? <div className="table-scroll"><table><thead><tr><th>Request</th><th>Customer UID</th><th>Opening deposit</th><th>Docs</th><th>Status</th><th>Decision</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td><strong className="mono">{row.id}</strong><small>{when(row.createdAt)}</small></td><td className="mono">{row.uid}</td>
          <td>{money(row.openingDepositMinor || 0)}</td><td>{(row.documentPaths || []).length}</td>
          <td><Chip size="small" label={row.status || '—'} className={'status-chip st-' + String(row.status).toLowerCase()} /></td>
          <td><Tooltip title={reason}><span><Button size="small" variant="outlined" disabled>Backend only</Button></span></Tooltip></td></tr>)}</tbody></table></div>
        : <Empty title="Nothing in this queue" />)}
      {paged.next && <div className="tool-row"><Button variant="outlined" onClick={paged.loadMore} disabled={paged.more}>{paged.more ? 'Loading…' : 'Load more'}</Button></div>}
    </section>
  </>;
}

export function AdminLimits({ goto }) {
  return <Shell goto={goto} title="Transfer" accent="limits" sub="Set per-transfer and daily limits for an account." sticker="Admin"><LimitsBody /></Shell>;
}

function LimitsBody() {
  const { individual, session } = usePortal();
  const paged = usePaged(token => individual.listAccountsForAdmin(token), []);
  const [selected, setSelected] = useState('');
  const [limit, reloadLimit] = useLoad(signal => individual.getLimit(selected, signal), [selected], Boolean(selected));
  const [perTransfer, setPerTransfer] = useState('');
  const [daily, setDaily] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  function review(event) {
    event.preventDefault();
    setError(''); setResult(null);
    const a = toPaise(perTransfer), b = toPaise(daily);
    if (!selected || a === null || b === null) { setError('Choose an account and enter positive amounts with at most two decimals.'); return; }
    if (a > b) { setError('The per-transfer limit cannot exceed the daily limit.'); return; }
    setConfirm({ perTransferMinor: a, dailyMinor: b });
  }
  async function save() {
    const change = confirm;
    setConfirm(null); setBusy(true);
    try {
      setResult(await individual.setLimit({ accountId: selected, ...change, actorUid: session.uid }));
      reloadLimit();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const existing = limit.data;
  return <>
    <section className="panel"><header className="panel-head"><div><h2>Set limits</h2><p>Balances are not shown here.</p></div></header>
      {paged.state.status === 'error' && <div style={{ padding: '0 20px 16px' }}><FsError error={paged.state.error} onRetry={paged.reload} /></div>}
      <form className="transfer-form" onSubmit={review} noValidate>
        <TextField select label="Account" required value={selected} onChange={e => { setSelected(e.target.value); setResult(null); setError(''); }}
          disabled={busy || paged.state.status !== 'ready'} helperText={paged.state.status === 'loading' ? 'Loading accounts…' : ' '}>
          {paged.rows.map(row => <MenuItem key={row.id} value={row.id}>{row.accountNumber || row.id} · {row.status || '—'}</MenuItem>)}</TextField>
        {paged.next && <div><Button size="small" variant="outlined" onClick={paged.loadMore} disabled={paged.more}>Load more accounts</Button></div>}
        {selected && limit.status === 'loading' && <Alert severity="info">Loading current limits…</Alert>}
        {selected && limit.status === 'error' && <FsError error={limit.error} onRetry={reloadLimit} />}
        {selected && limit.status === 'ready' && <Alert severity="info">{existing ? 'Current: ' + money(existing.perTransferMinor) + ' per transfer, ' + money(existing.dailyMinor) + ' per day (updated ' + when(existing.updateTime) + ').' : 'No limit document exists for this account yet.'}</Alert>}
        <TextField label="Per-transfer limit (INR)" required value={perTransfer} onChange={e => setPerTransfer(e.target.value)} disabled={busy} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        <TextField label="Daily limit (INR)" required value={daily} onChange={e => setDaily(e.target.value)} disabled={busy} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        {error && <Alert severity="error">{error}</Alert>}
        {result && <Alert severity={result.audit.ok ? 'success' : 'warning'}>Limits saved. {result.audit.ok ? 'Audit entry ' + result.audit.logid + ' recorded.' : 'The audit entry could NOT be written (' + result.audit.error.message + '). Record this change in your admin log.'}</Alert>}
        <div><Button type="submit" variant="contained" disabled={busy || !selected || limit.status === 'loading'}>{busy ? 'Saving…' : 'Review and save'}</Button></div>
      </form></section>
    <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}><DialogTitle>Confirm new limits</DialogTitle>
      <DialogContent>{confirm && 'Per transfer ' + money(confirm.perTransferMinor) + ', daily ' + money(confirm.dailyMinor) + ' for ' + selected + '.'}</DialogContent>
      <DialogActions><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="contained" onClick={save}>Save limits</Button></DialogActions></Dialog>
  </>;
}

export function AdminAudit({ goto }) {
  return <Shell goto={goto} title="Audit" accent="log" sub="Recorded admin actions (read-only)." sticker="Admin"><AuditBody /></Shell>;
}

function AuditBody() {
  const { individual } = usePortal();
  const paged = usePaged(token => individual.listAudit(token), []);
  const rows = [...paged.rows].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return <>
    <section className="panel"><header className="panel-head"><div><h2>Audit entries</h2><p>Sorted within the pages loaded so far.</p></div></header>
      {paged.state.status === 'loading' && <Loading />}
      {paged.state.status === 'error' && <div style={{ padding: '0 20px 20px' }}><FsError error={paged.state.error} onRetry={paged.reload} /></div>}
      {paged.state.status === 'ready' && (rows.length ? <div className="table-scroll"><table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td>{when(row.at || row.createTime)}</td><td><strong>{row.action || '—'}</strong></td><td className="mono">{row.actor || '—'}</td>
          <td style={{ whiteSpace: 'normal', minWidth: 240 }}>{row.description || row.id}</td></tr>)}</tbody></table></div> : <Empty title="No audit entries" />)}
      {paged.next && <div className="tool-row"><Button variant="outlined" onClick={paged.loadMore} disabled={paged.more}>{paged.more ? 'Loading…' : 'Load more'}</Button></div>}
    </section>
  </>;
}

export function AdminSettings({ goto }) {
  return <Shell goto={goto} title="Bank" accent="settings" sub="Identity and configuration records (read-only)." sticker="Admin"><SettingsBody /></Shell>;
}

function SettingsBody() {
  const { individual } = usePortal();
  const [state, reload] = useLoad(signal => individual.listSettings(signal), []);
  const docs = state.data?.documents || [];
  return <>
    <Alert severity="info">Editing bank metadata is not offered here: shared-directory changes must be validated by a trusted backend, and this project has no documented settings-edit flow.</Alert>
    {state.status === 'loading' && <section className="panel"><Loading /></section>}
    {state.status === 'error' && <FsError error={state.error} onRetry={reload} />}
    {state.status === 'ready' && (docs.length ? docs.map(doc => <section className="panel" key={doc.id}><header className="panel-head"><div><h2>{doc.id}</h2></div></header>
      <dl className="bank-details">{Object.entries(doc).filter(([key]) => !['id', 'createTime', 'updateTime'].includes(key)).map(([key, value]) => <div key={key} style={{ display: 'contents' }}>
        <dt>{key}</dt><dd>{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></section>)
      : <section className="panel"><Empty title="No settings documents" /></section>)}
  </>;
}
