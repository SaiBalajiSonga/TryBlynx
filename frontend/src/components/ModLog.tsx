import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import {
  Clipboard, CheckCircle, XCircle, RefreshCw,
  ChevronDown, ChevronUp, Shield, AlertTriangle,
} from 'lucide-react';

interface Review {
  id: string;
  user_id: string;
  user_username: string;
  user_avatar: string;
  reviewer_id?: string;
  old_data: Record<string, any>;
  new_data: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  reviewed_at?: string;
}

type TabId = 'queue' | 'log';

export function ModLog() {
  const [tab, setTab] = useState<TabId>('queue');
  const [queue, setQueue] = useState<Review[]>([]);
  const [log, setLog] = useState<Review[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [loadingLog, setLoadingLog] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [showReject, setShowReject] = useState<Record<string, boolean>>({});

  const fetchQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const data = await api.getModQueue();
      setQueue(data.reviews || []);
    } catch {}
    finally { setLoadingQueue(false); }
  }, []);

  const fetchLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const data = await api.getModLog();
      setLog(data.reviews || []);
    } catch {}
    finally { setLoadingLog(false); }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useEffect(() => { if (tab === 'log') fetchLog(); }, [tab, fetchLog]);

  const withAction = async (id: string, fn: () => Promise<void>) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try { await fn(); } finally { setActionLoading(prev => ({ ...prev, [id]: false })); }
  };

  const handleApprove = (r: Review) => withAction(r.id, async () => {
    await api.approveProfileReview(r.id);
    setQueue(prev => prev.filter(x => x.id !== r.id));
  });

  const handleReject = (r: Review) => withAction(r.id, async () => {
    const reason = rejectReason[r.id] || '';
    await api.rejectProfileReview(r.id, reason);
    setQueue(prev => prev.filter(x => x.id !== r.id));
    setShowReject(prev => ({ ...prev, [r.id]: false }));
  });

  const toggleExpand = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const diffFields = (oldData: Record<string, any>, newData: Record<string, any>) => {
    const fields = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    return Array.from(fields).filter(k => oldData[k] !== newData[k]);
  };

  const StatusChip = ({ status }: { status: string }) => {
    const map: Record<string, { color: string; bg: string; label: string }> = {
      pending:  { color: '#faa61a', bg: 'rgba(250,166,26,0.12)',  label: 'Pending'  },
      approved: { color: '#57f287', bg: 'rgba(87,242,135,0.12)',  label: 'Approved' },
      rejected: { color: '#ed4245', bg: 'rgba(237,66,69,0.12)',   label: 'Rejected' },
    };
    const s = map[status] ?? map['pending'];
    return (
      <span style={{ background: s.bg, color: s.color, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', letterSpacing: '0.3px' }}>
        {s.label}
      </span>
    );
  };

  const ReviewCard = ({ r, showActions }: { r: Review; showActions: boolean }) => {
    const changed = diffFields(r.old_data, r.new_data);
    const isExpanded = expanded[r.id];

    return (
      <div style={{ background: 'var(--blynx-800)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', transition: 'border-color 0.2s' }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Avatar */}
          <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #7289da)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '15px', flexShrink: 0, overflow: 'hidden' }}>
            {r.user_avatar
              ? <img src={r.user_avatar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              : (r.user_username?.charAt(0).toUpperCase() || 'U')}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
              <span style={{ color: 'white', fontWeight: 600, fontSize: '14px' }}>@{r.user_username}</span>
              <StatusChip status={r.status} />
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{timeAgo(r.created_at)}</span>
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
              Changed: {changed.length > 0 ? changed.join(', ') : 'no detectable fields'}
            </span>
          </div>

          <button
            onClick={() => toggleExpand(r.id)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {isExpanded && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>
            {/* Diff table */}
            <p style={{ margin: '0 0 10px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Changes</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '14px' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Field</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>Before</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>After</th>
                </tr>
              </thead>
              <tbody>
                {changed.map(field => (
                  <tr key={field} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>{field}</td>
                    <td style={{ padding: '6px 8px', color: '#ed4245', wordBreak: 'break-all' }}>
                      {String(r.old_data[field] ?? '—')}
                    </td>
                    <td style={{ padding: '6px 8px', color: '#57f287', wordBreak: 'break-all' }}>
                      {String(r.new_data[field] ?? '—')}
                    </td>
                  </tr>
                ))}
                {changed.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>No text fields changed</td></tr>
                )}
              </tbody>
            </table>

            {r.rejection_reason && (
              <div style={{ background: 'rgba(237,66,69,0.08)', border: '1px solid rgba(237,66,69,0.2)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#ed4245' }}>
                  <strong>Rejection reason:</strong> {r.rejection_reason}
                </p>
              </div>
            )}

            {/* Actions */}
            {showActions && r.status === 'pending' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <button
                  onClick={() => handleApprove(r)}
                  disabled={actionLoading[r.id]}
                  className="btn-accent"
                  style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', opacity: actionLoading[r.id] ? 0.6 : 1 }}
                >
                  <CheckCircle size={14} />
                  {actionLoading[r.id] ? 'Approving...' : 'Approve'}
                </button>

                {!showReject[r.id] ? (
                  <button
                    onClick={() => setShowReject(prev => ({ ...prev, [r.id]: true }))}
                    style={{ background: 'rgba(237,66,69,0.1)', border: '1px solid rgba(237,66,69,0.3)', color: '#ed4245', padding: '8px 16px', fontSize: '13px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <XCircle size={14} /> Reject
                  </button>
                ) : (
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <input
                      placeholder="Rejection reason (optional)"
                      value={rejectReason[r.id] || ''}
                      onChange={e => setRejectReason(prev => ({ ...prev, [r.id]: e.target.value }))}
                      style={{ width: '100%', background: 'var(--blynx-750)', border: '1px solid var(--border)', color: 'white', padding: '8px 10px', borderRadius: '6px', outline: 'none', fontSize: '13px', marginBottom: '6px', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => handleReject(r)} disabled={actionLoading[r.id]} style={{ background: '#ed4245', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                        Confirm Reject
                      </button>
                      <button onClick={() => setShowReject(prev => ({ ...prev, [r.id]: false }))} style={{ background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--blynx-900)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--blynx-850)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '800px' }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: '22px', color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clipboard size={22} color="var(--accent)" /> Moderator Dashboard
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
              Review profile update requests — visible only to moderators, admins, and developers.
            </p>
          </div>
          <button
            onClick={tab === 'queue' ? fetchQueue : fetchLog}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', fontSize: '13px' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '20px' }}>
          {(['queue', 'log'] as TabId[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '13px', fontWeight: tab === t ? 700 : 400,
              background: tab === t ? 'rgba(88,101,242,0.15)' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              {t === 'queue' ? <><AlertTriangle size={14} /> Review Queue {queue.length > 0 && <span style={{ background: '#ed4245', color: 'white', fontSize: '10px', padding: '1px 6px', borderRadius: '10px', fontWeight: 800 }}>{queue.length}</span>}</> : <><Shield size={14} /> Mod Log</>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tab === 'queue' && (
            loadingQueue ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
            ) : queue.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <CheckCircle size={40} style={{ marginBottom: '12px', opacity: 0.3, color: '#57f287' }} />
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>All clear!</p>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>No pending profile reviews.</p>
              </div>
            ) : (
              queue.map(r => <ReviewCard key={r.id} r={r} showActions />)
            )
          )}

          {tab === 'log' && (
            loadingLog ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading...</div>
            ) : log.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <p style={{ margin: 0, fontSize: '14px' }}>No review history yet.</p>
              </div>
            ) : (
              log.map(r => <ReviewCard key={r.id} r={r} showActions={false} />)
            )
          )}
        </div>
      </div>
    </div>
  );
}

// Fix: prevent unused import warning
