import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PrivacyPolicy() {
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
        <h1 style={{ color: 'white', fontSize: '40px', fontWeight: 800, marginBottom: '24px' }}>Privacy Policy</h1>
        <p>Last Updated: June 2026</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>1. Information We Collect</h2>
        <p>We collect information you provide directly to us, such as your username, email, and profile details. We also collect the content of messages you send through public and unencrypted channels. To enforce our safety guidelines, we collect hardware and browser properties to generate a cryptographic device fingerprint.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>2. How We Use Your Information</h2>
        <p>We use your information to operate the Lynxus platform, facilitate communication, and enforce our Terms of Service. We use on-device automated AI models to moderate video content. Additionally, we use your device fingerprint to associate hardware with banned accounts and prevent ban evasion.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>3. Data Retention and Auto-Deletion</h2>
        <p>To respect your privacy, public chat messages are automatically deleted after 30 days. You have the right to request the deletion of your account and all associated data at any time through your Profile settings.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>4. End-to-End Encrypted DMs</h2>
        <p>If you use our E2EE Direct Messaging feature, the content of your messages is encrypted on your device. Lynxus servers cannot read, access, or decrypt these messages.</p>

        <h2 style={{ color: 'white', marginTop: '32px' }}>5. Third-Party Sharing</h2>
        <p>We do not sell your personal data. We may share information with law enforcement only if legally required, such as in cases involving Child Sexual Abuse Material (CSAM).</p>
      </div>
    </div>
  );
}
