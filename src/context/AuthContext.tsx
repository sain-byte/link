import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  User,
  UserCredential,
} from 'firebase/auth';
import {
  auth,
  clearDriveAccessToken,
  driveAuth,
  getFirebaseDiagnostics,
  googleDriveProvider,
  googleProvider,
  setDriveAccessToken,
  subscribeDriveToken,
} from '../firebase';

export function formatAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Login Email/Password belum diaktifkan di Firebase Console (Authentication > Sign-in method).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email atau kata sandi salah, atau akun Google belum ditautkan dengan kata sandi. Masuk dengan Google terlebih dahulu lalu tambahkan kata sandi tambahan.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan gagal. Coba lagi beberapa saat.';
    case 'auth/popup-closed-by-user':
      return 'Popup login Google ditutup sebelum selesai.';
    case 'auth/unauthorized-domain': {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'domain ini';
      return `Domain "${host}" belum terdaftar di Firebase Console (Authentication > Settings > Authorized domains).`;
    }
    case 'auth/network-request-failed':
      return 'Koneksi jaringan bermasalah. Periksa internet Anda.';
    case 'auth/provider-already-linked':
      return 'Kata sandi sudah tertaut pada akun ini.';
    case 'auth/requires-recent-login':
      return 'Sesi terlalu lama. Silakan login ulang dengan Google untuk melanjutkan.';
    default:
      return err instanceof Error && err.message
        ? err.message
        : 'Gagal melakukan autentikasi.';
  }
}

interface AuthContextValue {
  user: User | null;
  isOwner: boolean;
  isEmailMatch: boolean;
  hasPasswordProvider: boolean;
  hasGoogleProvider: boolean;
  loading: boolean;
  ownerEmail: string;
  driveAccessToken: string | null;
  isDriveConnected: boolean;
  loginWithGoogle: () => Promise<UserCredential>;
  connectGoogleDrive: () => Promise<string>;
  disconnectGoogleDrive: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<UserCredential>;
  linkOrUpdatePassword: (newPassword: string) => Promise<'linked' | 'updated'>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  reloadUser: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_OWNER_EMAIL = 'sainbyte@gmail.com';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [driveAccessToken, setDriveTokenState] = useState<string | null>(null);

  const ownerEmail = (import.meta.env.VITE_OWNER_EMAIL || DEFAULT_OWNER_EMAIL)
    .trim()
    .toLowerCase();

  useEffect(() => {
    return subscribeDriveToken(setDriveTokenState);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        clearDriveAccessToken();
      }
      setAuthVersion((v) => v + 1);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // authVersion ensures derived flags update after reload() or linkWithCredential()
  void authVersion;

  const isEmailMatch = Boolean(
    user && (user.email || '').trim().toLowerCase() === ownerEmail
  );

  const isOwner = Boolean(isEmailMatch && user?.emailVerified);

  const hasPasswordProvider = Boolean(
    user?.providerData.some((p) => p.providerId === 'password')
  );

  const hasGoogleProvider = Boolean(
    user?.providerData.some((p) => p.providerId === 'google.com')
  );

  const loginWithGoogle = async (): Promise<UserCredential> => {
    const diag = getFirebaseDiagnostics();
    if (!diag.isCustomProject) {
      const result = await signInWithPopup(auth, googleDriveProvider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      if (cred?.accessToken) {
        setDriveAccessToken(cred.accessToken);
      }
      return result;
    }
    return signInWithPopup(auth, googleProvider);
  };

  const connectGoogleDrive = async (): Promise<string> => {
    const result = await signInWithPopup(driveAuth, googleDriveProvider);
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.accessToken) {
      throw new Error('Gagal mendapatkan token akses Google Drive.');
    }
    setDriveAccessToken(cred.accessToken);
    return cred.accessToken;
  };

  const disconnectGoogleDrive = async (): Promise<void> => {
    clearDriveAccessToken();
    if (driveAuth !== auth) {
      await signOut(driveAuth).catch(() => {});
    }
  };

  const loginWithEmail = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email.trim(), password);

  const linkOrUpdatePassword = async (newPassword: string): Promise<'linked' | 'updated'> => {
    const current = auth.currentUser;
    if (!current || !current.email) {
      throw new Error('Pengguna belum masuk.');
    }

    const alreadyHasPass = current.providerData.some((p) => p.providerId === 'password');

    const performAction = async () => {
      if (alreadyHasPass) {
        await updatePassword(current, newPassword);
        return 'updated' as const;
      }
      const cred = EmailAuthProvider.credential(current.email!, newPassword);
      await linkWithCredential(current, cred);
      return 'linked' as const;
    };

    try {
      const result = await performAction();
      await current.reload();
      setUser(auth.currentUser);
      setAuthVersion((v) => v + 1);
      return result;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/requires-recent-login') {
        await reauthenticateWithPopup(current, googleProvider);
        const result = await performAction();
        await current.reload();
        setUser(auth.currentUser);
        setAuthVersion((v) => v + 1);
        return result;
      }
      throw err;
    }
  };

  const resetPassword = (email: string) => sendPasswordResetEmail(auth, email.trim());

  const resendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const reloadUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    setUser(auth.currentUser);
    setAuthVersion((v) => v + 1);
    return Boolean(auth.currentUser.emailVerified);
  };

  const logout = async () => {
    clearDriveAccessToken();
    if (driveAuth !== auth) {
      await signOut(driveAuth).catch(() => {});
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isOwner,
        isEmailMatch,
        hasPasswordProvider,
        hasGoogleProvider,
        loading,
        ownerEmail,
        driveAccessToken,
        isDriveConnected: Boolean(driveAccessToken),
        loginWithGoogle,
        connectGoogleDrive,
        disconnectGoogleDrive,
        loginWithEmail,
        linkOrUpdatePassword,
        resetPassword,
        resendVerification,
        reloadUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus digunakan di dalam AuthProvider');
  return ctx;
}
