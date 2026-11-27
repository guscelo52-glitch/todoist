// Armazenamento: Firebase (sincroniza) ou local (teste / sem configuração).
import { Capacitor } from '@capacitor/core';
import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

export const cloud = !!firebaseConfig.apiKey;
let auth, db, uid, unsub;

export function start({ onUser, onData, onError }) {
  if (!cloud) return startLocal({ onUser, onData, onError });
  const app = initializeApp(firebaseConfig);
  auth = Capacitor.isNativePlatform() ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  onAuthStateChanged(auth, user => {
    unsub?.(); unsub = null; uid = user?.uid;
    onUser(user ? user.email : null);
    if (user) unsub = onSnapshot(collection(db, 'users', uid, 'items'), { includeMetadataChanges: true },
      s => onData(s.docs.map(x => ({ ...x.data(), id: x.id })), { pending: s.metadata.hasPendingWrites, cached: s.metadata.fromCache }),
      e => onError(e));
  });
  /** ops: [{id, data}] — data null apaga; senão mescla os campos */
  return (ops) => {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      for (const { id, data } of ops.slice(i, i + 400)) {
        const ref = doc(db, 'users', uid, 'items', id);
        data === null ? b.delete(ref) : b.set(ref, data, { merge: true });
      }
      b.commit().catch(onError);
    }
  };
}

function startLocal({ onUser, onData, onError }) {
  const KEY = 'pauta-local';
  let map = {};
  const load = () => { try { map = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { map = {}; } };
  const emit = () => onData(Object.values(map), { local: true });
  load();
  queueMicrotask(() => { onUser('local'); emit(); });
  addEventListener('storage', e => { if (e.key === KEY) { load(); emit(); } });
  return ops => {
    for (const { id, data } of ops) data === null ? delete map[id] : (map[id] = { ...map[id], ...data, id });
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) { onError(e); }
    emit();
  };
}

export const login = (e, p) => signInWithEmailAndPassword(auth, e, p);
export const register = (e, p) => createUserWithEmailAndPassword(auth, e, p);
export const reset = e => sendPasswordResetEmail(auth, e);
export const logout = () => signOut(auth);
