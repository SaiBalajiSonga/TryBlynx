import { MessageSquare, Video, Users } from 'lucide-react';


interface HomeProps {
  onNavigate: (tab: 'text-chat' | 'video-chat' | 'groups') => void;
}

export function Home({ onNavigate }: HomeProps) {
  return (
    <div style={{
      flex: 1, overflowY: 'auto', background: 'var(--blynx-900)',
      padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center'
    }}>
      <div style={{ maxWidth: '900px', width: '100%' }}>
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, margin: '0 0 12px', color: 'white' }}>
            Welcome to <span style={{ color: 'var(--accent)' }}>Lynxus</span>
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', margin: 0 }}>
            Connect with people globally. Choose how you want to interact today.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px'
        }}>
          {/* Text Chat Card */}
          <div
            onClick={() => onNavigate('text-chat')}
            style={cardStyle}
            onMouseEnter={handleHover}
            onMouseLeave={handleLeave}
          >
            <div style={{ ...iconContainerStyle, background: 'rgba(88,101,242,0.15)' }}>
              <MessageSquare size={32} color="var(--accent)" />
            </div>
            <h2 style={titleStyle}>Text Chat</h2>
            <p style={descStyle}>Jump into a random text conversation. Fast, simple, and anonymous.</p>
          </div>

          {/* Video Chat Card */}
          <div
            onClick={() => onNavigate('video-chat')}
            style={cardStyle}
            onMouseEnter={handleHover}
            onMouseLeave={handleLeave}
          >
            <div style={{ ...iconContainerStyle, background: 'rgba(237,66,69,0.15)' }}>
              <Video size={32} color="var(--red)" />
            </div>
            <h2 style={titleStyle}>Video Chat</h2>
            <p style={descStyle}>Face-to-face random matchmaking. Meet someone new instantly.</p>
          </div>

          {/* Group Chat Card */}
          <div
            onClick={() => onNavigate('groups')}
            style={cardStyle}
            onMouseEnter={handleHover}
            onMouseLeave={handleLeave}
          >
            <div style={{ ...iconContainerStyle, background: 'rgba(67,181,129,0.15)' }}>
              <Users size={32} color="var(--teal)" />
            </div>
            <h2 style={titleStyle}>Group Chat</h2>
            <p style={descStyle}>Join active rooms based on your interests. Hang out with multiple people.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline styles for cards
const cardStyle: React.CSSProperties = {
  background: 'var(--blynx-800)',
  border: '1px solid var(--border)',
  borderRadius: '16px',
  padding: '32px 24px',
  cursor: 'pointer',
  transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
};

const iconContainerStyle: React.CSSProperties = {
  width: '72px', height: '72px',
  borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  marginBottom: '20px'
};

const titleStyle: React.CSSProperties = {
  fontSize: '20px', fontWeight: 600, color: 'white', margin: '0 0 12px'
};

const descStyle: React.CSSProperties = {
  fontSize: '14px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5
};

const handleHover = (e: React.MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.transform = 'translateY(-4px)';
  e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.2)';
  e.currentTarget.style.borderColor = 'var(--border-bright)';
};

const handleLeave = (e: React.MouseEvent<HTMLDivElement>) => {
  e.currentTarget.style.transform = '';
  e.currentTarget.style.boxShadow = '';
  e.currentTarget.style.borderColor = 'var(--border)';
};
