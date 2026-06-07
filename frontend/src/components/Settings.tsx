import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { Save, Plus, X, User, Sliders, CheckCircle } from 'lucide-react';

export function SettingsView() {
  const { user, updateUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [newInterest, setNewInterest] = useState('');
  const [location, setLocation] = useState(user?.location || '');
  const [language, setLanguage] = useState(user?.language || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

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
      const payload = { display_name: displayName, bio, gender, location, language, interests };
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
  );
}

// Need React for createElement
import React from 'react';
