import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  INDIVIDUAL_FIRESTORE_BASE_URL, LYRA_BANK, SHARED_FIRESTORE_BASE_URL, USE_SIGN_IN_TOKEN_FOR_INDIVIDUAL_DB,
} from '../firestore-config.js';
import { baseUrlState, createFirestoreClient } from '../firestore/client.js';
import { individualApi, sharedApi } from '../firestore/api.js';

const Context = createContext(null);
export const usePortal = () => useContext(Context);

export function PortalProvider({ session, bank, children }) {
  const [idToken, setIdToken] = useState('');
  const [sharedToken, setSharedToken] = useState('');
  const [profile, setProfile] = useState({ status: 'idle', data: null, error: null });
  const live = useRef({});
  live.current = { idToken, sharedToken, signIn: session?.token };

  const individual = useMemo(() => individualApi(createFirestoreClient({
    baseUrl: INDIVIDUAL_FIRESTORE_BASE_URL,
    getToken: () => (USE_SIGN_IN_TOKEN_FOR_INDIVIDUAL_DB ? live.current.signIn : live.current.idToken),
  })), []);
  const shared = useMemo(() => sharedApi(createFirestoreClient({
    baseUrl: SHARED_FIRESTORE_BASE_URL, getToken: () => live.current.sharedToken,
  })), []);

  const configured = { individual: baseUrlState(INDIVIDUAL_FIRESTORE_BASE_URL), shared: baseUrlState(SHARED_FIRESTORE_BASE_URL) };
  const hasAuth = USE_SIGN_IN_TOKEN_FOR_INDIVIDUAL_DB ? Boolean(session?.token) : Boolean(idToken);
  const uid = session?.uid;

  // A different (or no) signed-in user must never inherit tokens or a role.
  useEffect(() => { setIdToken(''); setSharedToken(''); setProfile({ status: 'idle', data: null, error: null }); }, [uid]);

  const loadProfile = useCallback(async signal => {
    if (!uid) return;
    setProfile(current => ({ ...current, status: 'loading', error: null }));
    try {
      const data = await individual.getProfile(uid, signal);
      if (!signal?.aborted) setProfile({ status: 'ready', data, error: null });
    } catch (error) { if (!signal?.aborted) setProfile({ status: 'error', data: null, error }); }
  }, [individual, uid]);

  useEffect(() => {
    if (!uid || !hasAuth || configured.individual !== 'ok') return undefined;
    const controller = new AbortController();
    loadProfile(controller.signal);
    return () => controller.abort();
  }, [uid, hasAuth, idToken, configured.individual, loadProfile]);

  // UI gating only. Real enforcement is Firestore rules + the backend; never rely on this for security.
  const p = profile.data;
  const isAdmin = profile.status === 'ready' && String(p?.role).toUpperCase() === 'ADMIN'
    && String(p?.status).toUpperCase() === 'ACTIVE' && p?.bankId === LYRA_BANK.bankId;

  const value = { session, bank, individual, shared, configured, hasAuth, idToken, setIdToken, sharedToken, setSharedToken, profile, loadProfile, isAdmin };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
