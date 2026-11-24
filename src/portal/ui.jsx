import { useEffect, useState } from 'react';
import { Alert, Button } from '@mui/material';
import { usePortal } from './PortalContext.jsx';

export const money = minor => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(minor / 100);
export const when = value => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';

export function PageHeading({ title, accent, sub, sticker }) {
  return <header className="page-title">
    <div><h2 className="big-title">{title} {accent && <em>{accent}</em>}</h2>{sub && <p>{sub}</p>}</div>
    {sticker && <span className="sticker" aria-hidden="true">{sticker}</span>}
  </header>;
}

// Runs an async loader when `enabled`; aborts on unmount/dependency change.
export function useLoad(loader, deps, enabled = true) {
  const [state, setState] = useState({ status: enabled ? 'loading' : 'idle', data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState(current => ({ ...current, status: 'loading', error: null }));
    loader(controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ status: 'ready', data, error: null }); })
      .catch(error => { if (!controller.signal.aborted) setState({ status: 'error', data: null, error }); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick]);
  return [state, () => setTick(value => value + 1)];
}

export function FsError({ error, onRetry }) {
  return <Alert severity={error?.kind === 'denied' || error?.kind === 'auth' || error?.kind === 'config' ? 'warning' : 'error'}
    action={onRetry && <Button color="inherit" size="small" onClick={onRetry}>Retry</Button>}>{error?.message || 'Something went wrong.'}</Alert>;
}

export const Loading = ({ label = 'Loading…' }) => <div className="empty" role="status"><span className="spinner" aria-hidden="true" /><strong>{label}</strong></div>;

// Blocks a Firestore-backed page until the base URL and credentials exist, with exact next steps. No request is sent before then.
export function Gate({ need = 'individual', goto, children }) {
  const { configured, hasAuth } = usePortal();
  if (configured[need] !== 'ok') {
    return <section className="panel"><div className="empty"><strong>{need === 'shared' ? 'Shared' : 'Lyra'} Firestore URL not configured</strong>
      <p>{configured[need] === 'invalid' ? 'The base URL in src/firestore-config.js is not a valid Firestore documents URL.'
        : 'Replace the placeholder in src/firestore-config.js with your project’s documents URL, then rebuild.'}</p></div></section>;
  }
  if (need === 'individual' && !hasAuth) {
    return <section className="panel"><div className="empty"><strong>Firebase ID token needed</strong>
      <p>Firestore only answers requests that carry a Firebase Auth ID token for the Lyra project.</p>
      {goto && <Button variant="contained" onClick={() => goto('access')}>Open Data access</Button>}</div></section>;
  }
  return children;
}

export function AdminOnly({ children }) {
  const { isAdmin, profile } = usePortal();
  if (isAdmin) return children;
  return <section className="panel"><div className="empty"><strong>Admin access required</strong>
    <p>{profile.status === 'ready' ? 'Your user record does not have an active ADMIN role for this bank.' : 'Your role could not be read yet. Check Data access.'}</p></div></section>;
}
