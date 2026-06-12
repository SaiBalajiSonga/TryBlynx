import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Zap, Mail, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { getDeviceFingerprint } from '../lib/fingerprint';
import {
  generateKeyPair, exportPublicKey, exportPrivateKeyToJwk,
  encryptPrivateKey, decryptPrivateKey,
  storePrivateKey
} from '../lib/crypto';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080/api';

export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/login' : '/register';
      const fingerprint = await getDeviceFingerprint();
      const body = isLogin
        ? JSON.stringify({ email, password, fingerprint })
        : JSON.stringify({ email, password, username, fingerprint });

      let finalBody = body;
      let jwkToStore: JsonWebKey | null = null;

      if (!isLogin) {
        // REGISTER: Generate E2EE keys and encrypt private key with password
        try {
          const kp = await generateKeyPair();
          const pub = await exportPublicKey(kp.publicKey);
          const jwk = await exportPrivateKeyToJwk(kp.privateKey);

          // Random salt is generated inside encryptPrivateKey and stored in the blob
          const encPriv = await encryptPrivateKey(jwk, password);

          const parsedBody = JSON.parse(body);
          parsedBody.public_key = pub;
          parsedBody.encrypted_private_key = encPriv;
          finalBody = JSON.stringify(parsedBody);
          jwkToStore = jwk;
        } catch (err) {
          console.error('[E2EE] Setup failed during registration:', err);
        }
      }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: finalBody,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      // Post-success logic
      if (!isLogin && jwkToStore) {
        // Store the newly generated key
        storePrivateKey(data.user.id, jwkToStore);
      } else if (isLogin && data.encrypted_private_key) {
        // LOGIN: Decrypt the stored private key using the password
        // data.encrypted_private_key comes from the top-level authResponse field
        try {
          const jwk = await decryptPrivateKey(data.encrypted_private_key, password);
          storePrivateKey(data.user.id, jwk);
        } catch (err) {
          console.error('[E2EE] Failed to decrypt private key. Wrong password or corrupted data?', err);
        }
      }

      setAuth(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(88,101,242,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(67,181,129,0.05) 0%, transparent 50%)',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px', height: '56px',
            background: 'var(--accent)',
            borderRadius: '16px',
            marginBottom: '16px',
            boxShadow: '0 0 32px var(--accent-glow)',
          }}>
            <Zap size={28} color="white" fill="white" />
          </div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: 'white', letterSpacing: '-0.5px' }}>
            TryBlynx
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
            {isLogin ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--blynx-800)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '32px',
        }}>
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'rgba(237,66,69,0.1)',
              border: '1px solid rgba(237,66,69,0.3)',
              color: '#ed4245',
              padding: '12px 14px',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '14px',
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Username
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '36px' }}
                    placeholder="coolperson123"
                    required={!isLogin}
                  />
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '36px' }}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '36px' }}
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-accent"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '15px' }}
            >
              {loading ? (
                <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} className="animate-spin-slow" />
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setError('');
                setLoading(true);
                try {
                  const res = await fetch(`${API_URL}/guest`, { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Guest login failed');
                  setAuth(data.token, data.user);
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setLoading(false);
                }
              }}
              style={{
                width: '100%', marginTop: '16px', padding: '12px', background: 'var(--blynx-750)',
                border: '1px solid var(--border)', borderRadius: '12px', color: 'white',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--blynx-700)'; e.currentTarget.style.borderColor = 'var(--border-bright)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--blynx-750)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              Continue as Guest
            </button>
          </form>

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', marginTop: '20px' }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px', padding: 0 }}
            >
              {isLogin ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
