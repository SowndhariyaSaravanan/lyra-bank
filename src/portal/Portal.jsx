import { useMemo, useState } from 'react';
import { Alert, Button, Chip, Drawer, MenuItem, TextField } from '@mui/material';
import { ArrowLeftRight, Building2, Eye, EyeOff, Globe2, Landmark, List, Wallet } from 'lucide-react';

import { usePortal } from './PortalContext.jsx';
import { Icon } from './icons.jsx';
import { PageHeading } from './ui.jsx';
import { Beneficiaries, Kyc, Loans, Portfolio, Statement } from './FirestorePages.jsx';
import { AdminAudit, AdminKyc, AdminLimits, AdminSettings } from './AdminPages.jsx';
import { Coverage, DataAccess } from './AccessPages.jsx';

const money = minor => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
const time = value => value ? new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
}).format(new Date(value)) : '—';
const bankName = (directory, id) => directory.find(item => item.bankId === id)?.bankName || id;
const statusLabel = { PENDING: 'Pending', PROCESSING: 'Processing', COMPLETED: 'Completed', REJECTED: 'Rejected', MANUAL_REVIEW: 'Manual review' };
const donutColors = ['#c9f33b', '#b58cff', '#ff5fa8', '#ffa24a', '#7cc4ff'];
const isIncoming = row => row.direction === 'CREDIT' && row.type !== 'INTERNAL';
const isOutgoing = row => row.direction !== 'CREDIT' && row.type !== 'INTERNAL';

const navGroups = isAdmin => [
  { label: 'Customer', items: [
    { id: 'home', name: 'Overview', icon: 'home' }, { id: 'accounts', name: 'Accounts', icon: 'wallet' },
    { id: 'history', name: 'Transfers', icon: 'clock' }, { id: 'statement', name: 'Ledger', icon: 'book' },
    { id: 'beneficiaries', name: 'Payees', icon: 'users' }, { id: 'loans', name: 'Loans', icon: 'cash' },
    { id: 'portfolio', name: 'Portfolio', icon: 'pie' }, { id: 'reports', name: 'Reports', icon: 'list' },
    { id: 'kyc', name: 'My KYC', icon: 'file' }, { id: 'directory', name: 'Bank directory', icon: 'bank' } ] },
  ...(isAdmin ? [{ label: 'Admin', items: [
    { id: 'admin-kyc', name: 'KYC review', icon: 'file' }, { id: 'admin-limits', name: 'Transfer limits', icon: 'gauge' },
    { id: 'admin-audit', name: 'Audit log', icon: 'list' }, { id: 'admin-settings', name: 'Bank settings', icon: 'sliders' } ] }] : []),
  { label: 'Setup', items: [{ id: 'access', name: 'Data access', icon: 'key' }, { id: 'coverage', name: 'Security & coverage', icon: 'shield' }] },
];
const dockIds = ['home', 'accounts', 'history', 'beneficiaries'];

export function PortalNav({ view, onChange }) {
  const { isAdmin } = usePortal();
  const [open, setOpen] = useState(false);
  const groups = navGroups(isAdmin);
  const all = groups.flatMap(group => group.items);
  const pick = id => { onChange(id); setOpen(false); window.scrollTo(0, 0); };
  const button = (item, className) => <button key={item.id} type="button" className={className} onClick={() => pick(item.id)}
    aria-current={view === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{item.name}</span></button>;
  return <>
    <nav className="side-nav" aria-label="Portal sections">
      {groups.map(group => <div className="side-group" key={group.label}><span className="side-label">{group.label}</span>{group.items.map(item => button(item))}</div>)}
    </nav>
    <nav className="dock" aria-label="Quick navigation">
      {dockIds.map(id => button(all.find(item => item.id === id)))}
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-current={!dockIds.includes(view) ? 'page' : undefined}>
        <Icon name="menu" /><span>More</span></button>
    </nav>
    <Drawer anchor="bottom" open={open} onClose={() => setOpen(false)} slotProps={{ paper: { className: 'sheet', role: 'dialog', 'aria-label': 'All sections' } }}>
      <div className="sheet-head"><strong>Menu</strong><button type="button" className="sheet-close" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="close" /></button></div>
      {groups.map(group => <div className="sheet-group" key={group.label}><span className="side-label">{group.label}</span>
        <div className="sheet-grid">{group.items.map(item => button(item, 'sheet-item'))}</div></div>)}
    </Drawer>
  </>;
}

export function Hero({ bank }) {
  return <section className="hero" aria-label={bank.name + ' welcome'}>
    <div><h2>What do you want to do <em>today?</em></h2>
      <p>Sign in with your bank’s Firebase test login to see balances, send same-bank or interbank transfers and review your activity.</p>
      <span className="sticker" aria-hidden="true">Start your journey</span></div>
    <svg viewBox="0 0 360 260" role="img" aria-label="Illustration of a payment card, coins and a rising chart">
      <circle cx="262" cy="92" r="78" fill="#b58cff" />
      <circle cx="262" cy="92" r="46" fill="none" stroke="#c9f33b" strokeWidth="10" />
      <g transform="rotate(-9 130 150)"><rect x="28" y="90" width="206" height="124" rx="22" fill="#c9f33b" />
        <rect x="28" y="116" width="206" height="22" fill="#0b0a10" />
        <rect x="46" y="166" width="70" height="12" rx="6" fill="#0b0a10" />
        <circle cx="198" cy="184" r="14" fill="#b58cff" /><circle cx="214" cy="184" r="14" fill="#fff" fillOpacity=".9" /></g>
      <polyline points="206,226 244,196 272,208 322,150" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 40l7 16 16 7-16 7-7 16-7-16-16-7 16-7z" fill="#c9f33b" />
      <circle cx="318" cy="38" r="9" fill="#ff5fa8" />
    </svg>
  </section>;
}

function Stat({ label, value, note, tone }) {
  return <div className={'stat' + (tone ? ' ' + tone : '')}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function Accounts({ accounts }) {
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState('');
  const available = accounts.reduce((sum, item) => sum + item.availableMinor, 0);
  const held = accounts.reduce((sum, item) => sum + item.heldMinor, 0);
  const show = minor => hidden ? '₹ ••••••' : money(minor);
  async function copy(number) {
    try { await navigator.clipboard.writeText(number); setCopied('Copied ' + number); }
    catch { setCopied('Copy is not available in this browser.'); }
  }
  if (!accounts.length) return <section className="panel"><div className="empty"><Wallet size={24} /><strong>No accounts yet</strong>
    <p>No account is attached to this sign-in. Account opening is approved by the bank admin.</p></div></section>;
  return <div className="view-stack">
    <div className="stat-grid">
      <Stat tone="dark" label="Total available" value={show(available)} note={accounts.length + (accounts.length === 1 ? ' account' : ' accounts')} />
      <Stat tone="accent" label="Total held" value={show(held)} note="Reserved for pending transfers" />
      <Stat label="Posted (available + held)" value={show(available + held)} note="Derived from your dashboard figures" />
    </div>
    <section className="panel"><header className="panel-head"><div><h2>Account details</h2><p>Figures come from the Worker dashboard.</p></div>
      <Button size="small" variant="outlined" onClick={() => setHidden(!hidden)} startIcon={hidden ? <Eye size={16} /> : <EyeOff size={16} />}>
        {hidden ? 'Show balances' : 'Hide balances'}</Button></header>
      <div className="table-scroll"><table><thead><tr><th>Account number</th><th>Account ID</th><th>Status</th><th>Available</th><th>Held</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{accounts.map(item => <tr key={item.accountId}>
          <td><strong className="mono">{item.accountNumber}</strong></td><td className="mono">{item.accountId}</td>
          <td><Chip size="small" label={item.status || '—'} className={item.status === 'ACTIVE' ? 'completed' : ''} /></td>
          <td className="amount">{show(item.availableMinor)}</td><td>{show(item.heldMinor)}</td>
          <td><Button size="small" variant="outlined" onClick={() => copy(item.accountNumber)}>Copy number</Button></td></tr>)}</tbody></table></div>
      <div aria-live="polite" className="sr-only">{copied}</div>
      {copied && <p className="available" style={{ padding: '0 20px 16px' }}>{copied}</p>}
    </section>
    <Alert severity="info">Loan requests and your portfolio record are under Loans and Portfolio in the menu.</Alert>
  </div>;
}

function toCsv(rows, directory) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const head = ['Transfer ID', 'Created (IST)', 'Type', 'Direction', 'From bank', 'To bank', 'Amount (INR)', 'Status', 'Reason'];
  const lines = rows.map(row => [row.transferId, time(row.createdAt), row.type, row.direction, bankName(directory, row.sourceBankId),
    bankName(directory, row.destinationBankId), (row.amountMinor / 100).toFixed(2), row.status, row.code].map(cell).join(','));
  return [head.map(cell).join(','), ...lines].join('\r\n');
}

function History({ rows, directory, loaded }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(row => (status === 'all' || row.status === status)
      && (kind === 'all' || (kind === 'incoming' && isIncoming(row)) || (kind === 'outgoing' && isOutgoing(row)) || (kind === 'internal' && row.type === 'INTERNAL'))
      && (!term || (row.transferId + ' ' + bankName(directory, row.sourceBankId) + ' ' + bankName(directory, row.destinationBankId)).toLowerCase().includes(term)));
  }, [rows, directory, search, status, kind]);
  function download() {
    const url = URL.createObjectURL(new Blob([toCsv(filtered, directory)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'lyra-transfer-history.csv';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="panel"><header className="panel-head"><div><h2>Transaction history</h2>
    <p>{loaded ? filtered.length + ' of ' + rows.length + ' transfers (latest 50 returned by the Worker)' : 'Loading…'}</p></div><List size={19} /></header>
    <div className="tool-row">
      <TextField size="small" label="Search ID or bank" value={search} onChange={e => setSearch(e.target.value)} />
      <TextField size="small" select label="Status" value={status} onChange={e => setStatus(e.target.value)}>
        <MenuItem value="all">All statuses</MenuItem>{Object.entries(statusLabel).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      <TextField size="small" select label="Direction" value={kind} onChange={e => setKind(e.target.value)}>
        <MenuItem value="all">All</MenuItem><MenuItem value="outgoing">Outgoing</MenuItem><MenuItem value="incoming">Incoming</MenuItem><MenuItem value="internal">Same bank</MenuItem></TextField>
      <Button variant="outlined" disabled={!filtered.length} onClick={download}>Export CSV</Button>
    </div>
    {filtered.length ? <div className="table-scroll"><table><thead><tr><th>Transfer</th><th>Route</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>{filtered.map(row => <tr key={row.transferId}>
        <td><strong className="mono">{row.transferId}</strong><small>{time(row.createdAt)}</small></td>
        <td><strong>{bankName(directory, row.sourceBankId)} → {bankName(directory, row.destinationBankId)}</strong>
          <small>{row.type === 'INTERNAL' ? 'Same bank' : isIncoming(row) ? 'Incoming' : 'Outgoing'}</small></td>
        <td className={isIncoming(row) ? 'incoming amount' : 'amount'}>{money(row.amountMinor)}</td>
        <td><Chip size="small" label={statusLabel[row.status] || row.status} className={row.status === 'COMPLETED' ? 'completed' : ''} /></td></tr>)}</tbody></table></div>
      : <div className="empty"><ArrowLeftRight size={23} /><strong>{rows.length ? 'No transfers match these filters' : 'No transfers yet'}</strong>
        <p>{rows.length ? 'Clear the search or filters to see everything.' : 'Transfers appear here once the Worker records them.'}</p></div>}
  </section>;
}

function Reports({ rows, directory }) {
  const done = rows.filter(row => row.status === 'COMPLETED');
  const sum = list => list.reduce((total, row) => total + row.amountMinor, 0);
  const out = sum(done.filter(isOutgoing)), inn = sum(done.filter(isIncoming)), same = sum(done.filter(row => row.type === 'INTERNAL'));
  const statusCounts = Object.keys(statusLabel).map(key => [key, rows.filter(row => row.status === key).length]).filter(([, count]) => count);
  const partners = new Map();
  done.filter(row => row.type !== 'INTERNAL').forEach(row => {
    const id = isIncoming(row) ? row.sourceBankId : row.destinationBankId;
    partners.set(id, (partners.get(id) || 0) + row.amountMinor);
  });
  const partnerRows = [...partners].sort((a, b) => b[1] - a[1]);
  const top = partnerRows[0]?.[1] || 1;
  if (!rows.length) return <section className="panel"><div className="empty"><List size={24} /><strong>No data to report on</strong><p>Reports are computed from your transfers once you have some.</p></div></section>;
  return <div className="view-stack">
    <Alert severity="info">Computed in this browser from the latest 50 transfers. It is a summary, not an official statement.</Alert>
    <div className="stat-grid">
      <Stat tone="dark" label="Completed sent (interbank)" value={money(out)} />
      <Stat tone="accent" label="Completed received (interbank)" value={money(inn)} />
      <Stat label="Completed same-bank" value={money(same)} />
      <Stat label="Transfers analysed" value={rows.length} />
    </div>
    <section className="panel"><header className="panel-head"><div><h2>Transfers by status</h2></div></header>
      <div className="donut-wrap"><div className="donut" role="img" aria-label={statusCounts.map(([key, count]) => statusLabel[key] + ' ' + count).join(', ')}
        style={{ background: 'conic-gradient(' + (() => { let at = 0; return statusCounts.map(([key, count], index) => { const from = at; at += count / rows.length * 100; return donutColors[index % donutColors.length] + ' ' + from + '% ' + at + '%'; }).join(',') })() + ')' }}>
        <div className="donut-hole"><span>Total</span><strong>{rows.length}</strong></div></div>
        <ul className="donut-legend">{statusCounts.map(([key, count], index) => <li key={key}><span className="dot" style={{ background: donutColors[index % donutColors.length] }} />{statusLabel[key]}<strong>{count}</strong></li>)}</ul></div></section>
    <section className="panel"><header className="panel-head"><div><h2>Completed interbank volume by bank</h2></div></header>
      {partnerRows.length ? <div className="bar-list">{partnerRows.map(([id, value]) => <div className="bar-row" key={id}><div><span>{bankName(directory, id)}</span><span>{money(value)}</span></div>
        <div className="bar-track"><div className="bar-fill lime" style={{ width: Math.max(4, value / top * 100) + '%' }} /></div></div>)}</div>
        : <div className="empty"><Globe2 size={22} /><strong>No completed interbank transfers</strong></div>}</section>
  </div>;
}

function Directory({ directory, bank }) {
  const [search, setSearch] = useState('');
  const [ifsc, setIfsc] = useState('');
  const term = search.trim().toLowerCase();
  const list = directory.filter(item => !term || (item.bankName + ' ' + item.bankId + ' ' + item.ifsc).toLowerCase().includes(term));
  const code = ifsc.trim().toUpperCase();
  const valid = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code);
  const match = valid ? directory.find(item => item.ifsc === code) : undefined;
  return <div className="view-stack">
    <section className="panel"><header className="panel-head"><div><h2>IFSC lookup</h2><p>Checks the shared bank directory loaded from the Worker.</p></div><Building2 size={20} /></header>
      <div className="tool-row"><TextField size="small" label="IFSC code" value={ifsc} onChange={e => setIfsc(e.target.value)}
        error={Boolean(code) && !valid} helperText={code && !valid ? 'IFSC is 11 characters: 4 letters, 0, then 6 letters or digits.' : ' '}
        slotProps={{ htmlInput: { maxLength: 11, autoCapitalize: 'characters' } }} /></div>
      {valid && <Alert className="lookup-result" severity={match ? (match.status === 'ACTIVE' ? 'success' : 'warning') : 'info'}>
        {match ? match.bankName + ' (' + match.bankId + ') · ' + (match.status === 'ACTIVE' ? 'Active, eligible for transfers' : 'Inactive, not eligible for transfers')
          : 'This IFSC is not in the directory the Worker returned.'}</Alert>}
    </section>
    <section className="panel"><header className="panel-head"><div><h2>Bank directory</h2><p>{list.length} of {directory.length} banks</p></div><Landmark size={20} /></header>
      <div className="tool-row"><TextField size="small" label="Search banks" value={search} onChange={e => setSearch(e.target.value)} /></div>
      {list.length ? <div className="table-scroll"><table><thead><tr><th>Bank</th><th>Bank ID</th><th>IFSC</th><th>Status</th></tr></thead>
        <tbody>{list.map(item => <tr key={item.bankId + item.ifsc}><td><strong>{item.bankName}</strong>{item.bankId === bank.id && <small>This bank</small>}</td>
          <td className="mono">{item.bankId}</td><td className="mono">{item.ifsc}</td>
          <td><Chip size="small" label={item.status || '—'} className={item.status === 'ACTIVE' ? 'completed' : ''} /></td></tr>)}</tbody></table></div>
        : <div className="empty"><Building2 size={23} /><strong>{directory.length ? 'No banks match' : 'Directory not loaded'}</strong>
          <p>{directory.length ? 'Try a different search.' : 'The Worker has not returned any banks yet.'}</p></div>}
    </section>
  </div>;
}

const headings = {
  accounts: ['Your', 'accounts', 'Balances from your bank dashboard.', 'Money for a cooler you'],
  history: ['Transfer', 'history', 'Every transfer the Worker has recorded for you.', 'Small steps, big freedom'],
  reports: ['Your', 'spending', 'A summary of your recent transfers.', 'Your money, your rules'],
  directory: ['Bank', 'directory', 'Banks you can send money to.', 'Money meets people'],
};

export default function PortalViews({ view, bank, data, directory, loaded, onNavigate }) {
  const goto = target => { window.scrollTo(0, 0); onNavigate(target); };
  const head = headings[view] && <PageHeading title={headings[view][0]} accent={headings[view][1]} sub={headings[view][2]} sticker={headings[view][3]} />;
  const page = {
    accounts: () => <Accounts accounts={data.accounts} />,
    history: () => <History rows={data.transfers} directory={directory} loaded={loaded} />,
    reports: () => <Reports rows={data.transfers} directory={directory} />,
    directory: () => <Directory directory={directory} bank={bank} />,
  }[view];
  if (page) return <div className="view-stack">{head}{page()}</div>;
  switch (view) {
    case 'beneficiaries': return <Beneficiaries directory={directory} goto={goto} />;
    case 'loans': return <Loans accounts={data.accounts} goto={goto} />;
    case 'portfolio': return <Portfolio accounts={data.accounts} goto={goto} />;
    case 'statement': return <Statement accounts={data.accounts} goto={goto} />;
    case 'kyc': return <Kyc goto={goto} />;
    case 'admin-kyc': return <AdminKyc goto={goto} />;
    case 'admin-limits': return <AdminLimits goto={goto} />;
    case 'admin-audit': return <AdminAudit goto={goto} />;
    case 'admin-settings': return <AdminSettings goto={goto} />;
    case 'access': return <DataAccess />;
    case 'coverage': return <Coverage />;
    default: return null;
  }
}
