import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { AlertCircle, ArrowRight, Copy, Check, Shield, Key, Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import { getDeviceFingerprint } from '../lib/fingerprint';
import {
  generateKeyPair, exportPublicKey, exportPrivateKeyToJwk,
  encryptPrivateKey, decryptPrivateKey,
  storePrivateKey,
  // v2 MHK + recovery phrase
  deriveMHK, generateMHKSalt, setSessionMHK,
  generateMnemonic, mnemonicToMHK,
  encryptPrivateKeyWithPassphrase,
} from '../lib/crypto';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080/api';

// ── Mnemonic Screen ──────────────────────────────────────────────────────────
// Shown once after registration. User must confirm before continuing.
function MnemonicScreen({
  mnemonic,
  onConfirm,
}: {
  mnemonic: string;
  onConfirm: () => void;
}) {
  const words = mnemonic.trim().split(/\s+/);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — user can manually copy
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--blynx-900)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(88,101,242,0.1) 0%, transparent 60%)',
    }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '56px', height: '56px',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: '16px', marginBottom: '16px',
            boxShadow: '0 0 32px rgba(245,158,11,0.3)',
          }}>
            <Key size={28} color="white" />
          </div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'white' }}>
            Your Recovery Phrase
          </h1>
          <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
            Write these 12 words down and store them somewhere safe.<br />
            <strong style={{ color: 'var(--text-secondary)' }}>They are shown only once.</strong>
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--blynx-800)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '16px',
          padding: '28px',
        }}>
          {/* Warning banner */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '10px', padding: '12px 14px',
            marginBottom: '24px',
          }}>
            <Shield size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              This phrase is the <strong>only way</strong> to recover your encrypted chat history
              if you forget your password. Lynxus cannot recover it for you.
            </p>
          </div>

          {/* Word grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            marginBottom: '20px',
          }}>
            {words.map((word, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--blynx-750)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '13px',
              }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: '18px', fontSize: '11px' }}>
                  {i + 1}.
                </span>
                <span style={{ color: 'white', fontWeight: 600, fontFamily: 'monospace' }}>{word}</span>
              </div>
            ))}
          </div>

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            style={{
              width: '100%', padding: '10px', marginBottom: '20px',
              background: copied ? 'rgba(74,222,128,0.1)' : 'var(--blynx-750)',
              border: `1px solid ${copied ? 'rgba(74,222,128,0.4)' : 'var(--border)'}`,
              borderRadius: '10px', color: copied ? '#4ade80' : 'var(--text-secondary)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>

          {/* Confirmation checkbox */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            cursor: 'pointer', marginBottom: '20px',
          }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              style={{ marginTop: '2px', accentColor: 'var(--accent)', width: '15px', height: '15px' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              I have written down or saved my 12-word recovery phrase in a secure location.
            </span>
          </label>

          {/* Continue button */}
          <button
            type="button"
            onClick={onConfirm}
            disabled={!confirmed}
            className="btn-accent"
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '8px', fontSize: '15px',
              opacity: confirmed ? 1 : 0.5, cursor: confirmed ? 'pointer' : 'not-allowed',
            }}
          >
            Continue to Lynxus
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main AuthForm ─────────────────────────────────────────────────────────────
export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Username checking state
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const checkTimeout = useRef<any>(null);

  useEffect(() => {
    if (isLogin || !username) {
      setUsernameStatus('idle');
      return;
    }
    
    // basic local validation
    if (username.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    if (checkTimeout.current) clearTimeout(checkTimeout.current);

    checkTimeout.current = setTimeout(async () => {
      try {
        const result = await api.checkUsername(username);
        if (result.available) {
          setUsernameStatus('available');
        } else {
          setUsernameStatus('taken');
        }
      } catch (err) {
        setUsernameStatus('idle'); // fail silently for check
      }
    }, 500);

    return () => {
      if (checkTimeout.current) clearTimeout(checkTimeout.current);
    };
  }, [username, isLogin]);

  // After registration, show the mnemonic screen before entering the app
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [pendingAuth, setPendingAuth] = useState<{ token: string; user: any } | null>(null);

  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isLogin) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }
    }

    setLoading(true);

    try {
      const fingerprint = await getDeviceFingerprint();
      let token = '';
      let userProfile: any = null;

      if (!isLogin) {
        // ── REGISTER: Generate v1 RSA keypair BEFORE Supabase sign up
        let jwkToStore: JsonWebKey | null = null;
        let encPriv = '';
        let pub = '';
        try {
          const kp  = await generateKeyPair();
          pub = await exportPublicKey(kp.publicKey);
          const jwk = await exportPrivateKeyToJwk(kp.privateKey);
          encPriv = await encryptPrivateKey(jwk, password);
          jwkToStore = jwk;
        } catch (err) {
          console.error('[E2EE v1] Setup failed during registration:', err);
        }

        // ── SIGN UP: Register via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
              username: username,
              public_key: pub,
              encrypted_private_key: encPriv,
            }
          }
        });

        if (authError) throw authError;

        const session = authData.session;
        if (!session) {
          setVerificationSent(true);
          setLoading(false);
          return;
        }

        token = session.access_token;

        // (Keys were already generated above)

        // ── SYNC: Register/Sync user profile to Go backend
        const syncRes = await fetch(`${API_URL}/auth/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            username,
            fingerprint,
            public_key: pub,
            encrypted_private_key: encPriv,
          }),
        });

        const syncData = await syncRes.json();
        if (!syncRes.ok) throw new Error(syncData.error || 'Failed to sync user profile with server');
        userProfile = syncData.user;

        // ── Store v1 RSA private key
        if (jwkToStore) {
          storePrivateKey(userProfile.id, jwkToStore);
        }

        // ── Derive Master History Key (MHK) from password ───────────────────
        try {
          const mhkSalt = userProfile.mhk_salt || generateMHKSalt();
          const mhk = await deriveMHK(password, mhkSalt);
          setSessionMHK(mhk); // kept in JS memory only
        } catch (err) {
          console.warn('[MHK] Failed to derive Master History Key:', err);
        }

        // ── REGISTER: Generate 12-word mnemonic, encrypt MHK salt blob ────
        try {
          const mnemonic = generateMnemonic();
          const mhkSalt = userProfile.mhk_salt || generateMHKSalt();
          await mnemonicToMHK(mnemonic, mhkSalt);

          if (jwkToStore) {
            const recoveryBlob = await encryptPrivateKeyWithPassphrase(jwkToStore, mnemonic);
            // Upload recovery blob (token available now)
            const authHeader = `Bearer ${token}`;
            fetch(`${API_URL}/recovery/blob`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: authHeader },
              body: JSON.stringify({ blob: recoveryBlob }),
            }).catch(() => {});
          }

          // Show the mnemonic screen — hold auth until user confirms
          setPendingMnemonic(mnemonic);
          setPendingAuth({ token, user: userProfile });
          return; // Don't call setAuth yet
        } catch (err) {
          console.warn('[Mnemonic] Failed to generate recovery phrase:', err);
        }
      } else {
        // ── SIGN IN: Authenticate via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) throw authError;

        const session = authData.session;
        if (!session) throw new Error('Failed to acquire login session.');

        token = session.access_token;

        // ── PROFILE: Fetch profile from Go backend using the token
        const profileRes = await fetch(`${API_URL}/profile`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!profileRes.ok) {
          const errData = await profileRes.json().catch(() => null);
          const errorMsg = errData?.error || '';
          
          if (profileRes.status === 404 || errorMsg === 'user account not registered or active on this platform') {
            // ── DELAYED SYNC: User verified email but hasn't synced to Postgres yet
            const meta = session.user.user_metadata || {};
            if (!meta.username) {
              throw new Error('Incomplete registration data. Please contact support or register a new account.');
            }

            const syncRes = await fetch(`${API_URL}/auth/sync`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                username: meta.username,
                fingerprint: await getDeviceFingerprint(),
                public_key: meta.public_key,
                encrypted_private_key: meta.encrypted_private_key,
              }),
            });

            const syncData = await syncRes.json();
            if (!syncRes.ok) throw new Error(syncData.error || 'Failed to sync user profile with server');
            userProfile = syncData.user;
          } else {
            throw new Error(errorMsg || 'Failed to fetch user profile');
          }
        } else {
          userProfile = await profileRes.json();
        }

        // ── Store v1 RSA private key
        if (userProfile.encrypted_private_key) {
          try {
            const jwk = await decryptPrivateKey(userProfile.encrypted_private_key, password);
            storePrivateKey(userProfile.id, jwk);
          } catch (err) {
            console.error('[E2EE v1] Failed to decrypt private key on login:', err);
          }
        }

        // ── Derive Master History Key (MHK) from password
        try {
          const mhkSalt = userProfile.mhk_salt || generateMHKSalt();
          const mhk = await deriveMHK(password, mhkSalt);
          setSessionMHK(mhk);
        } catch (err) {
          console.warn('[MHK] Failed to derive Master History Key:', err);
        }
      }

      setAuth(token, userProfile);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Called when the user clicks "Continue" on the mnemonic screen
  const handleMnemonicConfirmed = () => {
    if (pendingAuth) {
      setAuth(pendingAuth.token, pendingAuth.user);
    }
    setPendingMnemonic(null);
    setPendingAuth(null);
  };
  // ── Show verification screen if awaiting email confirmation ──────────────
  if (verificationSent) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--blynx-900)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}>
        <div style={{ width: '100%', maxWidth: '420px', animation: 'fade-in 0.35s ease both' }} className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(88,101,242,0.1)', marginBottom: '16px' }}>
              <Mail size={32} color="var(--accent)" />
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Check your email</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
              We've sent a verification link to <strong>{email}</strong>. Please verify your email address to activate your account.
            </p>
          </div>
          <button
            onClick={() => { setVerificationSent(false); setIsLogin(true); }}
            className="btn-accent"
            style={{ width: '100%' }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // ── Show mnemonic screen if we have a pending registration ───────────────
  if (pendingMnemonic) {
    return (
      <MnemonicScreen
        mnemonic={pendingMnemonic}
        onConfirm={handleMnemonicConfirmed}
      />
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--blynx-900)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px', animation: 'fade-in 0.35s ease both' }}>


        {/* ── Error Banner ── */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            background: 'rgba(237,66,69,0.08)',
            border: '1px solid rgba(237,66,69,0.25)',
            color: '#ed4245',
            padding: '12px 14px',
            borderRadius: '12px',
            marginBottom: '20px',
            fontSize: '13px',
            lineHeight: 1.5,
            animation: 'fade-in 0.2s ease both',
          }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        {/* ── Card ── */}
        <div className="auth-card">
          
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {isLogin ? 'Welcome back!' : 'Create an account'}
            </h1>
            {isLogin && (
              <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '15px' }}>
                We're so excited to see you again!
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Email field ── */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Email<span style={{ color: '#ed4245' }}> *</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '14px' }}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* ── Display Name field (signup only) ── */}
            {!isLogin && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Display Name<span style={{ color: '#ed4245' }}> *</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '14px' }}
                    autoComplete="off"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            {/* ── Username field (signup only) ── */}
            {!isLogin && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Username<span style={{ color: '#ed4245' }}> *</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
                      if (error) setError('');
                    }}
                    className="input-field"
                    style={{
                      paddingLeft: '14px',
                      paddingRight: '38px',
                      borderColor: usernameStatus === 'taken' ? '#ed4245' : undefined,
                      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                    }}
                    autoComplete="off"
                    required={!isLogin}
                  />
                  {/* Status icon */}
                  <div style={{ position: 'absolute', right: '13px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                    {usernameStatus === 'checking' && <Loader2 size={15} color="var(--text-muted)" style={{ animation: 'spin 0.8s linear infinite' }} />}
                    {usernameStatus === 'available' && <CheckCircle size={15} color="#43b581" />}
                    {usernameStatus === 'taken' && <XCircle size={15} color="#ed4245" />}
                  </div>
                </div>

                {/* Taken warning */}
                {usernameStatus === 'taken' && (
                  <div style={{ marginTop: '6px', animation: 'fade-in 0.2s ease both' }}>
                    <span style={{ fontSize: '11px', color: '#ed4245', display: 'block' }}>
                      That username is taken.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Password field ── */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                Password<span style={{ color: '#ed4245' }}> *</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '14px', paddingRight: '56px' }}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', transition: 'color 0.15s' }}
                >
                  {showPassword ? 'HIDE' : 'SHOW'}
                </button>
              </div>
              {!isLogin && (
                <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                  Use at least 8 characters.
                </p>
              )}
            </div>

            {/* ── Submit button ── */}
            <button
              type="submit"
              disabled={loading}
              className="btn-accent"
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                fontSize: '15px', fontWeight: 600,
                padding: '12px',
                marginTop: '8px',
                borderRadius: '6px',
                transition: 'background 0.2s ease',
              }}
            >
              {loading ? (
                <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={16} className="arrow-icon" />
                </>
              )}
            </button>

            {/* ── Legal copy (signup) ── */}
            {!isLogin && (
              <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.6 }}>
                By signing up you agree to our{' '}
                <a href="/terms" target="_blank" className="auth-legal-link">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" className="auth-legal-link">Privacy Policy</a>.
              </p>
            )}
          </form>
        </div>

        {/* ── Toggle Sign in / Sign up ── */}
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', marginTop: '24px' }}>
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); setPassword(''); setUsername(''); }}
            style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px', padding: 0, fontFamily: 'inherit' }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}
