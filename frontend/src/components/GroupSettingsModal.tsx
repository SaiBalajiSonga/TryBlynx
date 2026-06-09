import React, { useState } from 'react';
import { api } from '../lib/api';
import { X, Save, Trash2, Settings, ShieldAlert, Clock } from 'lucide-react';

interface GroupData {
  id?: string;
  name: string;
  description: string;
  is_nsfw: boolean;
  slowmode_seconds: number;
}

interface Props {
  mode: 'create' | 'edit';
  initialData?: GroupData;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export function GroupSettingsModal({ mode, initialData, onClose, onSave, onDelete }: Props) {
  const [formData, setFormData] = useState<GroupData>(initialData || {
    name: '',
    description: '',
    is_nsfw: false,
    slowmode_seconds: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Channel name is required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (mode === 'create') {
        await api.adminCreateGroup(formData);
      } else if (mode === 'edit' && formData.id) {
        await api.adminUpdateGroup(formData.id, formData);
      }
      onSave();
    } catch (err: any) {
      setError(err.message || 'Failed to save group settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!formData.id || !onDelete) return;
    if (!window.confirm(`Are you absolutely sure you want to delete #${formData.name}? This cannot be undone.`)) return;

    setLoading(true);
    try {
      await api.adminDeleteGroup(formData.id);
      onDelete();
    } catch (err: any) {
      setError(err.message || 'Failed to delete group.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        background: 'var(--blynx-800)', width: '100%', maxWidth: '500px',
        borderRadius: '12px', overflow: 'hidden',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} color="var(--text-secondary)" />
            {mode === 'create' ? 'Create Text Channel' : `Edit #${formData.name}`}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '70vh' }}>
          {error && (
            <div style={{ padding: '10px', background: 'rgba(237, 66, 69, 0.1)', color: '#ed4245', borderRadius: '6px', fontSize: '13px', marginBottom: '20px', border: '1px solid rgba(237,66,69,0.3)' }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Channel Name <span style={{ color: '#ed4245' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '16px' }}>#</span>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                style={{ width: '100%', padding: '10px 12px 10px 30px', background: 'var(--blynx-900)', border: '1px solid var(--blynx-900)', borderRadius: '6px', color: 'white', fontSize: '15px', outline: 'none' }}
                placeholder="new-channel"
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Channel Topic
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--blynx-900)', border: '1px solid var(--blynx-900)', borderRadius: '6px', color: 'white', fontSize: '14px', outline: 'none', resize: 'vertical', minHeight: '80px' }}
              placeholder="Let everyone know how to use this channel!"
            />
          </div>

          <div style={{ height: '1px', background: 'var(--border)', margin: '0 -24px 24px' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 600, fontSize: '15px' }}>
                <ShieldAlert size={18} color={formData.is_nsfw ? '#ed4245' : 'var(--text-muted)'} />
                Age-Restricted Channel
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>Users will need to confirm they are over 18 to view this channel.</p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '24px' }}>
              <input type="checkbox" checked={formData.is_nsfw} onChange={e => setFormData({ ...formData, is_nsfw: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: formData.is_nsfw ? '#3ba55d' : 'var(--text-muted)', transition: '.4s', borderRadius: '24px' }}>
                <span style={{ position: 'absolute', content: '""', height: '18px', width: '18px', left: formData.is_nsfw ? '18px' : '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%' }} />
              </span>
            </label>
          </div>

          <div style={{ height: '1px', background: 'var(--border)', margin: '0 -24px 24px' }} />

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'white', fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
              <Clock size={18} color="var(--text-muted)" />
              Slowmode
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Members will be restricted to sending one message per this interval.</p>
            <input
              type="range"
              min="0" max="120" step="5"
              value={formData.slowmode_seconds}
              onChange={e => setFormData({ ...formData, slowmode_seconds: parseInt(e.target.value) })}
              style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            <div style={{ textAlign: 'center', color: 'var(--accent)', fontWeight: 600, fontSize: '14px', marginTop: '8px' }}>
              {formData.slowmode_seconds === 0 ? 'Off' : `${formData.slowmode_seconds} seconds`}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: 'var(--blynx-850)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {mode === 'edit' && onDelete ? (
            <button onClick={handleDelete} disabled={loading} style={{ background: 'transparent', color: '#ed4245', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trash2 size={16} /> Delete Channel
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} disabled={loading} style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={loading} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
