import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { Save, Plus, X, User, Sliders, CheckCircle, Upload } from 'lucide-react';
import { processAndModerateAvatar } from '../lib/moderation';
import React from 'react';
import { KeyBackupModal } from './KeyBackupModal';

export function SettingsView() {
  const { user, updateUser, clearAuth } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [showKeyBackup, setShowKeyBackup] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'deletemyaccount') {
      setDeleteError('Please type "deletemyaccount" exactly to confirm.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteAccount();
      clearAuth();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete account. Try again.');
      setDeleting(false);
    }
  };
  const [bio, setBio] = useState(user?.bio || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [newInterest, setNewInterest] = useState('');
  const [location, setLocation] = useState(user?.location || '');
  const [language, setLanguage] = useState(user?.language || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setError('');

    try {
      const result = await processAndModerateAvatar(file);
      if (!result.isSafe) {
        setError(result.reason || 'Image rejected by safety filter.');
        return;
      }
      if (result.base64Image) {
        setAvatarUrl(result.base64Image);
      }
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAddInterest = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && newInterest.trim()) {
      e.preventDefault();
      if (!interests.includes(newInterest.trim())) {
        setInterests([...interests, newInterest.trim()]);
      }
      setNewInterest('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaved(false);
    setError('');

    try {
      const payload = { display_name: displayName, bio, gender, location, language, interests, avatar_url: avatarUrl, public_key: user?.public_key || '' };
      await api.updateProfile(payload);
      updateUser(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const sectionHead = (icon: typeof User, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
      {React.createElement(icon, { size: 16, color: 'var(--accent)' })}
      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        {label}
      </span>
    </div>
  );

  const label = (text: string) => (
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '6px' }}>
      {text}
    </label>
  );

  return (
    <>
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--blynx-900)' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0,
        background: 'rgba(13,14,18,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 24px',
        zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <Sliders size={18} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: '16px', color: 'white' }}>Profile Settings</span>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
        {saved && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'rgba(67,181,129,0.1)',
            border: '1px solid rgba(67,181,129,0.3)',
            color: 'var(--teal)',
            padding: '12px 16px', borderRadius: '10px',
            marginBottom: '20px', fontSize: '14px',
            animation: 'fade-in 0.2s ease',
          }}>
            <CheckCircle size={16} />
            Profile updated successfully!
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(237,66,69,0.08)',
            border: '1px solid rgba(237,66,69,0.25)',
            color: '#ed4245', padding: '12px 16px', borderRadius: '10px',
            marginBottom: '20px', fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Identity */}
          <div style={{ background: 'var(--blynx-800)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
            {sectionHead(User, 'Identity')}

            <div style={{ marginBottom: '14px' }}>
              {label('Avatar (PFP)')}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '50%', background: 'var(--blynx-700)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  border: '2px solid rgba(255,255,255,0.1)'
                }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <User size={32} color="var(--text-muted)" />
                  )}
                </div>
                <div>
                  <label style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
                    background: 'var(--blynx-700)', padding: '8px 16px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--blynx-600)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--blynx-700)'}
                  >
                    {isUploadingAvatar ? (
                       <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} className="animate-spin-slow" />
                    ) : <Upload size={14} />}
                    {isUploadingAvatar ? 'Checking image...' : 'Upload Image'}
                    <input type="file" accept="image/png, image/jpeg, image/webp" style={{ display: 'none' }} onChange={handleAvatarUpload} disabled={isUploadingAvatar} />
                  </label>
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>AI Moderation is active. NSFW images will be rejected.</p>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              {label('Display Name')}
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                className="input-field" placeholder="How should others see you?" />
            </div>

            <div style={{ marginBottom: '14px' }}>
              {label('Bio')}
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
                className="input-field" placeholder="Tell us about yourself…"
                style={{ resize: 'none', lineHeight: 1.5, paddingTop: '10px' }} />
            </div>

            <div>
              {label('Gender')}
              <select value={gender} onChange={e => setGender(e.target.value)}
                className="input-field" style={{ appearance: 'none', cursor: 'pointer' }}>
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          {/* Matchmaking */}
          <div style={{ background: 'var(--blynx-800)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
            {sectionHead(Sliders, 'Matchmaking Filters')}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
              <div>
                {label('Location')}
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  className="input-field" placeholder="e.g. Mumbai, Tokyo" />
              </div>
              <div>
                {label('Language')}
                <input type="text" value={language} onChange={e => setLanguage(e.target.value)}
                  className="input-field" placeholder="e.g. English, Hindi" />
              </div>
            </div>

            <div>
              {label('Interests')}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {interests.map((interest) => (
                  <span key={interest} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '4px 10px',
                    background: 'rgba(88,101,242,0.15)',
                    border: '1px solid rgba(88,101,242,0.3)',
                    color: 'var(--accent)',
                    fontSize: '13px', borderRadius: '20px',
                  }}>
                    {interest}
                    <button type="button" onClick={() => setInterests(interests.filter(i => i !== interest))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex', alignItems: 'center' }}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text" value={newInterest} onChange={e => setNewInterest(e.target.value)}
                  onKeyDown={handleAddInterest}
                  className="input-field" placeholder="Type and press Enter…"
                />
                <button type="button"
                  onClick={() => {
                    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
                      setInterests([...interests, newInterest.trim()]);
                      setNewInterest('');
                    }
                  }}
                  style={{
                    padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                    background: 'var(--blynx-700)', color: 'var(--text-secondary)',
                    cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center',
                    transition: 'background 0.12s',
                  }}>
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit" disabled={isSaving}
            className="btn-accent"
            style={{ width: '100%', padding: '13px', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            {isSaving
              ? <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} className="animate-spin-slow" />
              : <Save size={17} />
            }
            {isSaving ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      </div>
    </div>
    {showKeyBackup && <KeyBackupModal onClose={() => setShowKeyBackup(false)} />}
    {showDeleteAccount && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '420px', background: 'var(--blynx-850)', borderRadius: '16px', border: '1px solid rgba(237,66,69,0.3)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', padding: '28px', animation: 'fade-in 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(237,66,69,0.12)', border: '1px solid rgba(237,66,69,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '22px' }}>⚠️</span>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700, color: 'white' }}>Delete Account</h2>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            This will <strong style={{ color: '#ed4245' }}>permanently delete</strong> your account, all your messages, and all your data. This cannot be undone.
          </p>
          <div style={{ background: 'rgba(237,66,69,0.06)', border: '1px solid rgba(237,66,69,0.15)', borderRadius: '10px', padding: '14px', marginBottom: '18px' }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Type <strong style={{ color: 'white', fontFamily: 'monospace' }}>deletemyaccount</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="deletemyaccount"
              autoComplete="off"
              style={{ width: '100%', background: 'var(--blynx-750)', border: `1px solid ${deleteConfirmText === 'deletemyaccount' ? 'rgba(74,222,128,0.4)' : 'var(--border)'}`, borderRadius: '8px', padding: '10px 12px', color: 'white', fontSize: '14px', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
            />
          </div>
          {deleteError && (
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#ed4245', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⚠️ {deleteError}
            </p>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setShowDeleteAccount(false)} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--blynx-700)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={deleting || deleteConfirmText !== 'deletemyaccount'}
              style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: deleteConfirmText === 'deletemyaccount' ? '#ed4245' : 'rgba(237,66,69,0.2)', color: deleteConfirmText === 'deletemyaccount' ? 'white' : 'rgba(237,66,69,0.5)', cursor: deleteConfirmText === 'deletemyaccount' && !deleting ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {deleting ? <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : '🗑️'}
              {deleting ? 'Deleting…' : 'Delete Forever'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
