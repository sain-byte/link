import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  increment,
  initializeFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import appletConfig from '../firebase-applet-config.json';

const envProjectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const activeProjectId = envProjectId || appletConfig.projectId;
const isCustomProject = Boolean(envProjectId && envProjectId !== appletConfig.projectId);

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim() || appletConfig.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() || appletConfig.authDomain,
  projectId: activeProjectId,
  storageBucket:
    (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || appletConfig.storageBucket,
  messagingSenderId:
    (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() ||
    appletConfig.messagingSenderId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim() || appletConfig.appId,
};

const rawEnvDatabaseId = (import.meta.env.VITE_FIREBASE_DATABASE_ID || '').trim();
const normalizedEnvDatabaseId =
  rawEnvDatabaseId.toLowerCase() === 'default' ? '(default)' : rawEnvDatabaseId;
const isRtdbOrUrlDatabaseId = Boolean(
  normalizedEnvDatabaseId &&
    (/^https?:\/\//i.test(normalizedEnvDatabaseId) ||
      normalizedEnvDatabaseId.includes('firebasedatabase.app') ||
      normalizedEnvDatabaseId.includes('firebaseio.com') ||
      normalizedEnvDatabaseId.includes('/'))
);

// Isolasi lintas-proyek: jangan pernah memakai firestoreDatabaseId dari firebase-applet-config.json
// apabila VITE_FIREBASE_PROJECT_ID mengarah ke proyek Firebase berbeda.
const appletFirestoreDbId = (appletConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
const fallbackDatabaseId = isCustomProject
  ? '(default)'
  : appletFirestoreDbId || '(default)';

const databaseId =
  normalizedEnvDatabaseId && !isRtdbOrUrlDatabaseId
    ? normalizedEnvDatabaseId
    : fallbackDatabaseId;

if (isRtdbOrUrlDatabaseId) {
  console.warn(
    `[sainbyte] VITE_FIREBASE_DATABASE_ID berisi URL Realtime Database/path tidak valid ("${rawEnvDatabaseId}"). Menggunakan database Firestore "(default)" sebagai fallback aman.`
  );
}

export type ConnectionStatus = 'checking' | 'healthy' | 'error';

export interface FirebaseDiagnostics {
  projectId: string;
  databaseId: string;
  isCustomProject: boolean;
  rtdbUrlDetected: boolean;
  rawInvalidDatabaseId: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  connectionErrorCode: string | null;
}

let diagnosticsState: FirebaseDiagnostics = {
  projectId: firebaseConfig.projectId,
  databaseId,
  isCustomProject,
  rtdbUrlDetected: isRtdbOrUrlDatabaseId,
  rawInvalidDatabaseId: isRtdbOrUrlDatabaseId ? rawEnvDatabaseId : null,
  connectionStatus: 'checking',
  connectionError: null,
  connectionErrorCode: null,
};

const diagnosticListeners = new Set<(state: FirebaseDiagnostics) => void>();

function updateDiagnostics(patch: Partial<FirebaseDiagnostics>) {
  diagnosticsState = { ...diagnosticsState, ...patch };
  diagnosticListeners.forEach((listener) => listener(diagnosticsState));
}

export function getFirebaseDiagnostics(): FirebaseDiagnostics {
  return diagnosticsState;
}

export function subscribeFirebaseDiagnostics(
  listener: (state: FirebaseDiagnostics) => void
): () => void {
  diagnosticListeners.add(listener);
  listener(diagnosticsState);
  return () => {
    diagnosticListeners.delete(listener);
  };
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
] as const;

export const googleDriveProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleDriveProvider.addScope(scope));
googleDriveProvider.setCustomParameters({
  include_granted_scopes: 'true',
  prompt: 'consent',
});

// When a custom Firebase project (e.g., VITE_FIREBASE_PROJECT_ID) is active for Firestore,
// run Google Drive OAuth via the AI Studio-provisioned applet OAuth app so Drive API works reliably.
const driveOAuthApp = app;
export const driveAuth = auth;

let cachedDriveAccessToken: string | null = null;
const driveTokenListeners = new Set<(token: string | null) => void>();

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function setDriveAccessToken(token: string | null) {
  cachedDriveAccessToken = token || null;
  driveTokenListeners.forEach((listener) => listener(cachedDriveAccessToken));
}

export function clearDriveAccessToken() {
  setDriveAccessToken(null);
}

export function subscribeDriveToken(listener: (token: string | null) => void): () => void {
  driveTokenListeners.add(listener);
  listener(cachedDriveAccessToken);
  return () => {
    driveTokenListeners.delete(listener);
  };
}

export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    experimentalLongPollingOptions: { timeoutSeconds: 15 },
  },
  databaseId === '(default)' ? undefined : databaseId
);
export const storage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function buildErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function reportFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo = buildErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = reportFirestoreError(error, operationType, path);
  throw new Error(JSON.stringify(errInfo));
}

export function extractFirestoreCode(err: unknown): string {
  const rawCode = ((err as { code?: string })?.code || '').toLowerCase();
  if (rawCode) return rawCode;

  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('permission_denied') || lower.includes('missing or insufficient permissions')) {
    return 'permission-denied';
  }
  if (lower.includes('not-found') || lower.includes('not_found') || lower.includes('does not exist')) {
    return 'not-found';
  }
  if (lower.includes('the client is offline') || lower.includes('unavailable')) {
    return 'unavailable';
  }
  if (lower.includes('deadline-exceeded') || lower.includes('timeout')) {
    return 'deadline-exceeded';
  }
  if (lower.includes('unauthenticated')) {
    return 'unauthenticated';
  }
  if (lower.includes('invalid-argument') || lower.includes('invalid_argument')) {
    return 'invalid-argument';
  }
  return '';
}

export function formatFirestoreError(err: unknown): string {
  const code = extractFirestoreCode(err);
  const rtdbHint = diagnosticsState.rtdbUrlDetected
    ? ' Variabel VITE_FIREBASE_DATABASE_ID terdeteksi berisi URL Realtime Database, bukan ID Firestore.'
    : '';

  switch (code) {
    case 'permission-denied':
      return diagnosticsState.isCustomProject
        ? `Izin ditolak Firestore pada proyek "${diagnosticsState.projectId}". Publikasikan aturan keamanan dari file firestore.rules ke Firebase Console (Firestore Database > Rules) proyek "${diagnosticsState.projectId}", atau hapus variabel kustom VITE_FIREBASE_* di Secrets untuk memakai database bawaan.${rtdbHint}`
        : `Izin ditolak Firestore pada proyek "${diagnosticsState.projectId}". Pastikan firestore.rules sudah aktif dan Anda masuk sebagai pemilik terverifikasi.${rtdbHint}`;
    case 'unavailable':
      return `Database Firestore "${diagnosticsState.projectId}" (${diagnosticsState.databaseId}) tidak terjangkau atau offline. Periksa jaringan dan pastikan layanan Cloud Firestore sudah aktif.${rtdbHint}`;
    case 'deadline-exceeded':
      return `Koneksi ke Firestore terlalu lama (timeout) pada proyek "${diagnosticsState.projectId}". Periksa jaringan dan konfigurasi Firestore.${rtdbHint}`;
    case 'not-found':
      return `Database Firestore "${diagnosticsState.databaseId}" pada proyek "${diagnosticsState.projectId}" tidak ditemukan. Pastikan Cloud Firestore (Native mode) sudah dibuat di Firebase Console.${rtdbHint}`;
    case 'invalid-argument':
      return 'Format data tidak sesuai aturan validasi Firestore.';
    case 'unauthenticated':
      return 'Sesi autentikasi berakhir. Silakan masuk ulang.';
    default: {
      const msg = err instanceof Error && err.message ? err.message : 'Gagal terhubung ke Firestore.';
      return `${msg}${rtdbHint}`;
    }
  }
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    updateDiagnostics({
      connectionStatus: 'healthy',
      connectionError: null,
      connectionErrorCode: null,
    });
  } catch (error) {
    const code = extractFirestoreCode(error);
    if (code === 'permission-denied') {
      // Beberapa proyek pribadi tidak menambahkan aturan khusus /test/connection; cek pembacaan /projects
      try {
        await getDocsFromServer(query(collection(db, 'projects'), limit(1)));
        updateDiagnostics({
          connectionStatus: 'healthy',
          connectionError: null,
          connectionErrorCode: null,
        });
        return;
      } catch (fallbackErr) {
        const fbCode = extractFirestoreCode(fallbackErr);
        updateDiagnostics({
          connectionStatus: 'error',
          connectionError: formatFirestoreError(fallbackErr),
          connectionErrorCode: fbCode || 'permission-denied',
        });
        return;
      }
    }

    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    } else {
      reportFirestoreError(error, OperationType.GET, 'test/connection');
    }

    updateDiagnostics({
      connectionStatus: 'error',
      connectionError: formatFirestoreError(error),
      connectionErrorCode: code || 'unknown',
    });
  }
}

export function withTimeout<T>(promise: Promise<T>, ms = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const err = new Error(
        'Koneksi ke Firestore terlalu lama (timeout). Periksa jaringan atau muat ulang halaman.'
      ) as Error & { code?: string };
      err.code = 'deadline-exceeded';
      reject(err);
    }, ms);
    promise
      .then((val) => {
        window.clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

type RestFieldValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values: RestFieldValue[] } }
  | { mapValue: { fields: Record<string, RestFieldValue> } };

function encodeRestValue(val: unknown): RestFieldValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: Number.isFinite(val) ? val : 0 };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeRestValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, RestFieldValue> = {};
    Object.entries(val as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) {
        fields[k] = encodeRestValue(v);
      }
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function mapRestStatusToCode(status?: string): string {
  switch (status) {
    case 'PERMISSION_DENIED':
      return 'permission-denied';
    case 'UNAVAILABLE':
    case 'DEADLINE_EXCEEDED':
      return 'unavailable';
    case 'NOT_FOUND':
      return 'not-found';
    case 'INVALID_ARGUMENT':
      return 'invalid-argument';
    case 'UNAUTHENTICATED':
      return 'unauthenticated';
    case 'ALREADY_EXISTS':
      return 'already-exists';
    default:
      return '';
  }
}

async function executeRestCommit(writes: Record<string, unknown>[], timeoutMs = 15000): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // Proceed without token for public writes if token lookup fails
      }
    }

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      firebaseConfig.projectId
    )}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(
      firebaseConfig.apiKey
    )}`;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ writes }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let errData: { error?: { status?: string; message?: string } } = {};
      try {
        errData = (await res.json()) as { error?: { status?: string; message?: string } };
      } catch {
        // Ignore parse failure
      }
      const status = errData.error?.status;
      if (status === 'ALREADY_EXISTS') {
        return;
      }
      const err = new Error(errData.error?.message || `HTTP ${res.status}`) as Error & {
        code?: string;
      };
      err.code = mapRestStatusToCode(status);
      throw err;
    }
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      const timeoutErr = new Error(
        'Koneksi ke Firestore terlalu lama (timeout). Periksa jaringan atau muat ulang halaman.'
      ) as Error & { code?: string };
      timeoutErr.code = 'deadline-exceeded';
      throw timeoutErr;
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

function buildFullDocName(docPath: string): string {
  const cleanPath = docPath.replace(/^\/+/, '');
  return `projects/${firebaseConfig.projectId}/databases/${databaseId}/documents/${cleanPath}`;
}

export async function safeAddDoc(
  collectionPath: string,
  plainData: Record<string, unknown>,
  options?: {
    serverTimestampFields?: string[];
    sdkTimeoutMs?: number;
  }
): Promise<{ id: string; usedFallback: boolean }> {
  const ref = doc(collection(db, collectionPath));
  const tsFields = options?.serverTimestampFields || [];
  const sdkPayload: Record<string, unknown> = { ...plainData };
  tsFields.forEach((f) => {
    sdkPayload[f] = serverTimestamp();
  });

  try {
    await withTimeout(setDoc(ref, sdkPayload), options?.sdkTimeoutMs ?? 7000);
    return { id: ref.id, usedFallback: false };
  } catch (sdkErr) {
    const code = extractFirestoreCode(sdkErr);
    if (code && code !== 'unavailable' && code !== 'deadline-exceeded') {
      reportFirestoreError(sdkErr, OperationType.CREATE, `${collectionPath}/${ref.id}`);
      throw sdkErr;
    }
  }

  const fields: Record<string, RestFieldValue> = {};
  Object.entries(plainData).forEach(([k, v]) => {
    if (v !== undefined && !tsFields.includes(k)) {
      fields[k] = encodeRestValue(v);
    }
  });

  const writeOp: Record<string, unknown> = {
    update: {
      name: buildFullDocName(ref.path),
      fields,
    },
    currentDocument: { exists: false },
  };
  if (tsFields.length > 0) {
    writeOp.updateTransforms = tsFields.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));
  }

  try {
    await executeRestCommit([writeOp]);
    return { id: ref.id, usedFallback: true };
  } catch (restErr) {
    reportFirestoreError(restErr, OperationType.CREATE, `${collectionPath}/${ref.id}`);
    throw restErr;
  }
}

export async function safeUpdateDoc(
  docPath: string,
  plainData: Record<string, unknown>,
  options?: {
    serverTimestampFields?: string[];
    incrementFields?: Record<string, number>;
    sdkTimeoutMs?: number;
  }
): Promise<{ usedFallback: boolean }> {
  const ref = doc(db, docPath);
  const tsFields = options?.serverTimestampFields || [];
  const incFields = options?.incrementFields || {};
  const sdkPayload: Record<string, unknown> = { ...plainData };
  tsFields.forEach((f) => {
    sdkPayload[f] = serverTimestamp();
  });
  Object.entries(incFields).forEach(([k, delta]) => {
    sdkPayload[k] = increment(delta);
  });

  try {
    await withTimeout(updateDoc(ref, sdkPayload), options?.sdkTimeoutMs ?? 7000);
    return { usedFallback: false };
  } catch (sdkErr) {
    const code = extractFirestoreCode(sdkErr);
    if (code && code !== 'unavailable' && code !== 'deadline-exceeded') {
      reportFirestoreError(sdkErr, OperationType.UPDATE, docPath);
      throw sdkErr;
    }
  }

  const fields: Record<string, RestFieldValue> = {};
  const maskPaths: string[] = [];
  Object.entries(plainData).forEach(([k, v]) => {
    if (v !== undefined && !tsFields.includes(k) && !(k in incFields)) {
      fields[k] = encodeRestValue(v);
      maskPaths.push(k);
    }
  });

  const transforms: Record<string, unknown>[] = [];
  tsFields.forEach((fieldPath) => {
    transforms.push({ fieldPath, setToServerValue: 'REQUEST_TIME' });
  });
  Object.entries(incFields).forEach(([fieldPath, delta]) => {
    transforms.push({
      fieldPath,
      increment: Number.isInteger(delta) ? { integerValue: String(delta) } : { doubleValue: delta },
    });
  });

  const writeOp: Record<string, unknown> =
    maskPaths.length === 0 && transforms.length > 0
      ? {
          transform: {
            document: buildFullDocName(docPath),
            fieldTransforms: transforms,
          },
        }
      : {
          update: {
            name: buildFullDocName(docPath),
            fields,
          },
          updateMask: { fieldPaths: maskPaths },
          currentDocument: { exists: true },
          ...(transforms.length > 0 ? { updateTransforms: transforms } : {}),
        };

  try {
    await executeRestCommit([writeOp]);
    return { usedFallback: true };
  } catch (restErr) {
    reportFirestoreError(restErr, OperationType.UPDATE, docPath);
    throw restErr;
  }
}

export async function safeDeleteDoc(
  docPath: string,
  options?: { sdkTimeoutMs?: number }
): Promise<{ usedFallback: boolean }> {
  const ref = doc(db, docPath);
  try {
    await withTimeout(deleteDoc(ref), options?.sdkTimeoutMs ?? 7000);
    return { usedFallback: false };
  } catch (sdkErr) {
    const code = extractFirestoreCode(sdkErr);
    if (code && code !== 'unavailable' && code !== 'deadline-exceeded') {
      reportFirestoreError(sdkErr, OperationType.DELETE, docPath);
      throw sdkErr;
    }
  }

  try {
    await executeRestCommit([{ delete: buildFullDocName(docPath) }]);
    return { usedFallback: true };
  } catch (restErr) {
    reportFirestoreError(restErr, OperationType.DELETE, docPath);
    throw restErr;
  }
}

void testConnection();

