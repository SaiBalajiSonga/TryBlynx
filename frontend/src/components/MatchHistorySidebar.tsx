
import { Clock } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

export function MatchHistorySidebar() {
  const recentMatches = useChatStore((s) => s.recentMatches);

  return (
    <div style={{ 
      width: '280px', 
      borderRight: '1px solid var(--border)', 
      background: 'var(--blynx-850)', 
      display: 'flex', 
      flexDirection: 'column',
      flexShrink: 0
    }}>
      <div style={{
        padding: '0 20px',
        height: '56px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
      }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Clock size={16} color="var(--text-muted)" />
          Recent Matches
        </h3>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {recentMatches.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
            No recent matches.
          </p>
        ) : (
          recentMatches.map(match => (
            <div key={match.peer_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: 'var(--blynx-800)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), #7289da)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700, color: 'white', flexShrink: 0
              }}>
                {(match.display_name || match.username).charAt(0).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {match.display_name || match.username}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {new Date(match.matched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
