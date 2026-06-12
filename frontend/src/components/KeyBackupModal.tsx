import { useState, useEffect } from 'react';
import { Shield, Lock, Key, Eye, EyeOff, CheckCircle, AlertCircle, X, Download, Upload, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { saveKeyBackup, getKeyBackup } from '../lib/api';
import {
  loadPrivateKey, storePrivateKey,
  encryptPrivateKeyWithPassphrase, decryptPrivateKeyWithPassphrase,
  passphraseStrength,
} from '../lib/crypto';

type Mode = 'status' | 'create' | 'restore' | 'change';

interface Props { onClose: () => void; }

export function KeyBackupModal({ onClose }: Props) {
  const user = useAuthStore(s => s.user);
  const [mode, setMode] = useState<Mode>('status');
  const [hasLocalKey, setHasLocalKey] = useState(false);
  const [hasBackup, setHasBackup] = useState<boolean | null>(null); // null = loading
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const strength = passphraseStrength(passphrase);

  // Check state on mount
  useEffect(() => {
    if (!user) return;
    setHasLocalKey(!!loadPrivateKey(user.id));
    getKeyBackup()
      .then(() => setHasBackup(true))
      .catch(() => setHasBackup(false));
  }, [user?.id]);

  const reset = () => { setPassphrase(''); setConfirm(''); setResult(null); setShowPass(false); };

  // ── Create / Update backup ────────────────────────────────────────────────
  const handleCreateBackup = async () => {
    if (!user) return;
    if (passphrase.length < 8) { setResult({ ok: false, msg: 'Passphrase must be at least 8 characters.' }); return; }
    if (passphrase !== confirm) { setResult({ ok: false, msg: 'Passphrases do not match.' }); return; }

    const privJwk = loadPrivateKey(user.id);
    if (!privJwk) { setResult({ ok: false, msg: 'No local key found. Open a DM first to generate your key.' }); return; }

    setBusy(true);
    setResult(null);
    try {
      const blob = await encryptPrivateKeyWithPassphrase(privJwk, passphrase);
      await saveKeyBackup(blob);
      setHasBackup(true);
      setResult({ ok: true, msg: hasBackup ? 'Backup updated successfully!' : 'Backup created! Your key is now protected.' });
      reset();
      setTimeout(() => setMode('status'), 1500);
    } catch (err: any) {
      setResult({ ok: false, msg: err.message || 'Failed to save backup.' });
    } finally {
      setBusy(false);
    }
  };

  // ── Restore from backup ───────────────────────────────────────────────────
  const handleRestore = async () => {
    if (!user) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await getKeyBackup();
      const privJwk = await decryptPrivateKeyWithPassphrase(res.blob, passphrase);
      storePrivateKey(user.id, privJwk);
      setHasLocalKey(true);
      setResult({ ok: true, msg: 'Key restored successfully! Your messages are readable again.' });
      reset();
      setTimeout(() => setMode('status'), 1500);
    } catch (err: any) {
      setResult({ ok: false, msg: err.message === 'Incorrect passphrase' ? 'Wrong passphrase. Try again.' : (err.message || 'Restore failed.') });
    } finally {
      setBusy(false);
    }
  };

  const s: Record<string, React.CSSProperties> = {
    input: { width: '100%', background: 'var(--blynx-750)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 36px 10px 12px', color: 'white', fontSize: '14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
    btn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '11px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', width: '100%', transition: 'opacity 0.15s' },
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', background: 'var(--blynx-850)', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden', animation: 'fade-in 0.2s ease' }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(88,101,242,0.12)', border: '1px solid rgba(88,101,242,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} color="var(--accent)" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'white' }}>Encryption Key Backup</h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>Protect your DM decryption key with a passphrase</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px' }}>

          {/* Status view */}
          {mode === 'status' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Status cards */}
              <StatusCard
                icon={Key} label="Local key"
                ok={hasLocalKey}
                okText="Present on this device"
                failText="Missing — open a DM to generate"
              />
              <StatusCard
                icon={Shield} label="Cloud backup"
                ok={hasBackup === true}
                loading={hasBackup === null}
                okText="Backed up with passphrase"
                failText="Not backed up yet"
              />

              {/* Explainer */}
              <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-secondary)' }}>How it works</p>
                Your private key never leaves your device unprotected. The backup is encrypted with your passphrase using PBKDF2 + AES-256 — the server cannot read it. Only you can restore it using your passphrase.
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {hasLocalKey && (
                  <button onClick={() => { reset(); setMode('create'); }} style={{ ...s.btn, background: 'var(--accent)', color: 'white' }}>
                    <Download size={15} /> {hasBackup ? 'Update Backup' : 'Create Backup'}
                  </button>
                )}
                {hasBackup && !hasLocalKey && (
                  <button onClick={() => { reset(); setMode('restore'); }} style={{ ...s.btn, background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
                    <Upload size={15} /> Restore from Backup
                  </button>
                )}
                {hasBackup && hasLocalKey && (
                  <button onClick={() => { reset(); setMode('restore'); }} style={{ ...s.btn, background: 'var(--blynx-700)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    <RefreshCw size={15} /> Restore on Another Device
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Create / Update backup */}
          {(mode === 'create' || mode === 'change') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Choose a strong passphrase. You'll need it to restore your key on a new device. <strong style={{ color: 'var(--text-secondary)' }}>We cannot recover it for you.</strong>
              </p>

              <PassphraseInput label="Passphrase" value={passphrase} onChange={setPassphrase} show={showPass} onToggle={() => setShowPass(s => !s)} inputStyle={s.input} />

              {/* Strength bar */}
              {passphrase.length > 0 && (
                <div>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    {[0,1,2,3].map(i => (
                      <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: i < strength.score ? strength.color : 'var(--blynx-600)', transition: 'background 0.2s' }} />
                    ))}
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: strength.color }}>{strength.label}</p>
                </div>
              )}

              <PassphraseInput label="Confirm passphrase" value={confirm} onChange={setConfirm} show={showPass} onToggle={() => setShowPass(s => !s)} inputStyle={s.input} />

              {result && <ResultBanner ok={result.ok} msg={result.msg} />}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setMode('status')} style={{ ...s.btn, background: 'var(--blynx-700)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
                <button onClick={handleCreateBackup} disabled={busy || passphrase.length < 8 || passphrase !== confirm} style={{ ...s.btn, background: 'var(--accent)', color: 'white', opacity: busy || passphrase.length < 8 || passphrase !== confirm ? 0.5 : 1, cursor: busy ? 'wait' : 'pointer', flex: 2 }}>
                  {busy ? <Spinner /> : <><Lock size={15} /> Save Backup</>}
                </button>
              </div>
            </div>
          )}

          {/* Restore */}
          {mode === 'restore' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Enter your backup passphrase to restore your encryption key on this device.
              </p>

              <PassphraseInput label="Backup passphrase" value={passphrase} onChange={setPassphrase} show={showPass} onToggle={() => setShowPass(s => !s)} inputStyle={s.input} />

              {result && <ResultBanner ok={result.ok} msg={result.msg} />}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setMode('status')} style={{ ...s.btn, background: 'var(--blynx-700)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
                <button onClick={handleRestore} disabled={busy || !passphrase} style={{ ...s.btn, background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', opacity: busy || !passphrase ? 0.5 : 1, cursor: busy ? 'wait' : 'pointer', flex: 2 }}>
                  {busy ? <Spinner /> : <><Upload size={15} /> Restore Key</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small helper components ───────────────────────────────────────────────────

function StatusCard({ icon: Icon, label, ok, loading, okText, failText }: {
  icon: typeof Key; label: string; ok: boolean; loading?: boolean; okText: string; failText: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', background: 'var(--blynx-800)', border: '1px solid var(--border)' }}>
      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: ok ? 'rgba(74,222,128,0.1)' : 'rgba(251,146,60,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={ok ? '#4ade80' : '#fb923c'} />
      </div>
      <div>
        <p style={{ margin: '0 0 1px', fontSize: '13px', fontWeight: 600, color: 'white' }}>{label}</p>
        <p style={{ margin: 0, fontSize: '12px', color: loading ? 'var(--text-muted)' : ok ? '#4ade80' : '#fb923c' }}>
          {loading ? 'Checking…' : ok ? okText : failText}
        </p>
      </div>
      <div style={{ marginLeft: 'auto' }}>
        {loading ? <Spinner /> : ok ? <CheckCircle size={16} color="#4ade80" /> : <AlertCircle size={16} color="#fb923c" />}
      </div>
    </div>
  );
}

function PassphraseInput({ label, value, onChange, show, onToggle, inputStyle }: {
  label: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; inputStyle: React.CSSProperties;
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          autoComplete="new-password"
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
        />
        <button type="button" onClick={onToggle} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

function ResultBanner({ ok, msg }: { ok: boolean; msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${ok ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`, fontSize: '13px', color: ok ? '#4ade80' : '#f87171', animation: 'fade-in 0.2s ease' }}>
      {ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
      {msg}
    </div>
  );
}

function Spinner() {
  return <div style={{ width: '15px', height: '15px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />;
}

import React from 'react';
