import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { api } from '../lib/api';
import { Crown, MapPin, Globe, Edit3, Save, Plus, X } from 'lucide-react';

export function ProfilePanel() {
  const { user, updateUser } = useAuthStore();
  const { showToast } = useUIStore();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [gender, setGender] = useState(user?.gender || '');
  const [location, setLocation] = useState(user?.location || '');
  const [language, setLanguage] = useState(user?.language || '');
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [newInterest, setNewInterest] = useState('');
  const [saving, setSaving] = useState(false);

  const initials = (user?.display_name || user?.username || 'U').charAt(0).toUpperCase();
  const name = user?.display_name || user?.username || 'Anonymous';

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { display_name: displayName, bio, gender, location, language, interests };
      await api.updateProfile(payload);
      updateUser(payload);
      setEditing(false);
      showToast('success', 'Profile updated!');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save profile');
    } finally { setSaving(false); }
  };

  const addInterest = () => {
    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
      setInterests([...interests, newInterest.trim()]);
      setNewInterest('');
    }
  };

  const inputKd = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); addInterest(); } };

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
      {/* Cover + Avatar */}
      <div style={{
        height: '160px', position: 'relative',
        background: 'linear-gradient(135deg, #6c63ff 0%, #f472b6 50%, #fb923c 100%)',
        backgroundSize: '200% 200%',
        animation: 'gradShift 6s ease infinite',
      }}>
        <div style={{
          position: 'absolute', bottom: '-40px', left: '28px',
          width: '80px', height: '80px', borderRadius: '50%',
          background: user?.is_vip ? 'linear-gradient(135deg, #fbbf24, #fb923c)' : 'var(--grad-accent)',
          border: '4px solid var(--bg-base)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', fontWeight: 800, color: 'white',
          boxShadow: '0 0 24px var(--accent-glow)',
        }}>
          {initials}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn btn-ghost" style={{
            position: 'absolute', bottom: '12px', right: '20px',
            padding: '6px 14px', fontSize: '12px', gap: '5px',
            background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.15)', color: 'white',
          }}>
            <Edit3 size={13} /> Edit
          </button>
        )}
      </div>

      <div style={{ padding: '56px 28px 28px' }}>
        {/* Identity */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h2 className="font-display" style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.5px' }}>{name}</h2>
            {user?.is_vip && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: '11px', fontWeight: 700 }}>
                <Crown size={10} /> VIP
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '8px' }}>@{user?.username}</p>
          {user?.bio && !editing && <p style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.6 }}>{user.bio}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
            {user?.location && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-3)' }}>
                <MapPin size={11} /> {user.location}
              </span>
            )}
            {user?.language && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-3)' }}>
                <Globe size={11} /> {user.language}
              </span>
            )}
          </div>
          {user?.interests && user.interests.length > 0 && !editing && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
              {user.interests.map(i => (
                <span key={i} style={{ padding: '3px 10px', borderRadius: '20px', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent)', fontSize: '12px', fontWeight: 500 }}>
                  {i}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Edit form */}
        {editing && (
          <form onSubmit={handleSave} className="anim-fadeUp" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Display Name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="input" placeholder="Your name" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gender</label>
                <select value={gender} onChange={e => setGender(e.target.value)} className="input" style={{ cursor: 'pointer' }}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Location</label>
                <input value={location} onChange={e => setLocation(e.target.value)} className="input" placeholder="City, Country" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Language</label>
                <input value={language} onChange={e => setLanguage(e.target.value)} className="input" placeholder="English, Hindi…" />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} className="input" rows={3} style={{ resize: 'none' }} placeholder="Tell the world who you are…" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Interests</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {interests.map(i => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent)', fontSize: '12px' }}>
                    {i}
                    <button type="button" onClick={() => setInterests(interests.filter(x => x !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}><X size={11} /></button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={newInterest} onChange={e => setNewInterest(e.target.value)} onKeyDown={inputKd} className="input" placeholder="Add interest, press Enter" />
                <button type="button" onClick={addInterest} className="btn btn-ghost" style={{ padding: '8px 12px', flexShrink: 0 }}><Plus size={16} /></button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1, padding: '12px', gap: '7px' }}>
                {saving ? <div className="anim-spin" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} /> : <Save size={15} />}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn btn-ghost" style={{ padding: '12px 20px' }}>
                <X size={15} /> Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
