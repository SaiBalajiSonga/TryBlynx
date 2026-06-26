import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--blynx-900)',
      color: 'var(--text-secondary)',
      fontFamily: '"Inter", sans-serif',
      padding: '48px 24px',
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <button 
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: 0, marginBottom: '32px' }}
        >
          <ArrowLeft size={20} /> Back to Home
        </button>
        <h1 style={{ color: 'white', fontSize: '40px', fontWeight: 800, marginBottom: '24px' }}>Terms of Service</h1>
        <p>Last Updated: June 2026</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>1. Acceptance of Terms</h2>
        <p>By accessing or using Lynxus, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>2. User Conduct & Acceptable Use</h2>
        <p>You agree not to use Lynxus to:</p>
        <ul>
          <li>Share or promote illegal content, including CSAM.</li>
          <li>Harass, abuse, or threaten others.</li>
          <li>Distribute spam or malicious software.</li>
          <li>Impersonate any person or entity.</li>
          <li>Display nudity, explicit sexual content, or perform inappropriate gestures on camera.</li>
        </ul>
        <p>We reserve the right to ban accounts and remove content that violates these rules.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>3. Automated AI Moderation & Enforcement</h2>
        <p>To ensure the safety of our community, Lynxus employs on-device AI moderation during WebRTC video calls. By using the video call feature, you consent to the automated sampling of video frames. These frames are processed locally on your device and are not transmitted to our servers unless a violation is detected.</p>
        <p>Violations detected by the AI moderation system will result in an immediate automated "Strike". Strikes carry escalating temporary bans (e.g., 15 minutes, 24 hours, 7 days) up to a permanent ban. To enforce bans across multiple accounts, Lynxus generates and tracks a cryptographic device fingerprint. Banned devices will be prohibited from accessing the service.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>4. Privacy and Data</h2>
        <p>Your use of Lynxus is also governed by our Privacy Policy. Please review it to understand how we collect, use, and share information about you.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>5. End-to-End Encryption</h2>
        <p>Direct Messages (DMs) may utilize End-to-End Encryption (E2EE). You acknowledge that if you lose your private cryptographic keys, Lynxus cannot recover your encrypted messages.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>6. Limitation of Liability</h2>
        <p>Lynxus is provided "as is". We make no warranties regarding the reliability or security of the service. We are not liable for any damages arising from your use of the platform.</p>
      </div>
    </div>
  );
}
