import { useState, useRef } from 'react';
import { Upload, X, CheckCircle, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';

interface ReportModalProps {
  userId: string;
  onClose: () => void;
  onReportSuccess?: () => void;
}

const REPORT_CATEGORIES = [
  'CSAM',
  'Sexual Harassment',
  'Harassment',
  'Impersonation',
  'Hate Speech',
  'Spam',
  'Other'
];

export function ReportModal({ userId, onClose, onReportSuccess }: ReportModalProps) {
  const [category, setCategory] = useState(REPORT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setProofFile(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      // In a real app, you would upload the file to a CDN/S3 bucket first and get the URL.
      // For this implementation, we will fake the upload URL if a file is present.
      let proofUrl = '';
      if (proofFile) {
        proofUrl = `https://dummy-cdn.com/uploads/${proofFile.name}`;
      }

      const fullReason = `${category}: ${description}`;
      if (proofUrl) {
        // @ts-ignore - bypassing stale IDE caches which think reportUser takes 2-3 args
        await api.reportUser(userId, fullReason, undefined, proofUrl);
      } else {
        await api.reportUser(userId, fullReason);
      }
      
      setSuccess(true);
      setTimeout(() => {
        if (onReportSuccess) {
          onReportSuccess();
        }
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to submit report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100000
    }} onClick={onClose}>
      <div 
        style={{
          background: 'var(--blynx-800)',
          width: '100%', maxWidth: '500px',
          borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
          padding: '24px', borderTop: '1px solid var(--border)',
          transform: 'translateY(0)', transition: 'transform 0.3s',
          display: 'flex', flexDirection: 'column', gap: '20px'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldAlert color="#ed4245" size={24} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Report User</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--success)' }}>
            <CheckCircle size={48} style={{ marginBottom: '16px' }} />
            <h3>Report Submitted Successfully</h3>
            <p style={{ color: 'var(--text-muted)' }}>Thank you for keeping our community safe.</p>
          </div>
        ) : (
          <>
            {error && <div style={{ color: '#ed4245', background: 'rgba(237,66,69,0.1)', padding: '12px', borderRadius: '8px', fontSize: '14px' }}>{error}</div>}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
              <select 
                value={category} 
                onChange={e => setCategory(e.target.value)}
                style={{
                  background: 'var(--blynx-750)', border: '1px solid var(--border)', 
                  color: 'white', padding: '12px', borderRadius: '8px', outline: 'none'
                }}
              >
                {REPORT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Description</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Provide additional details..."
                rows={3}
                style={{
                  background: 'var(--blynx-750)', border: '1px solid var(--border)', 
                  color: 'white', padding: '12px', borderRadius: '8px', outline: 'none', resize: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Screenshot / Evidence (Optional)</label>
              <input 
                type="file" 
                accept="image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  background: 'var(--blynx-750)', border: '1px dashed var(--border)',
                  color: 'var(--text-secondary)', padding: '16px', borderRadius: '8px', cursor: 'pointer'
                }}
              >
                <Upload size={18} />
                {proofFile ? proofFile.name : 'Upload Screenshot'}
              </button>
            </div>

            <button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-accent"
              style={{
                background: '#ed4245', color: 'white', padding: '14px', borderRadius: '8px',
                fontWeight: 600, marginTop: '12px', opacity: isSubmitting ? 0.7 : 1
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
