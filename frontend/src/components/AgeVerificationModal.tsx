import { useState, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';

export function AgeVerificationModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const checkAgeVerification = async () => {
      // Check if already verified
      if (localStorage.getItem('age_verified') === 'true') {
        return;
      }

      try {
        // Fetch IP location using a free public API
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        
        // If country is US, show age verification
        if (data.country_code === 'US' || data.country === 'US') {
          setShow(true);
        }
      } catch (err) {
        console.error('Failed to fetch IP location for age verification:', err);
      }
    };

    checkAgeVerification();
  }, []);

  const handleVerify = () => {
    localStorage.setItem('age_verified', 'true');
    setShow(false);
  };

  const handleDecline = () => {
    // Redirect to a safe page or Google
    window.location.href = 'https://www.google.com';
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '24px'
    }}>
      <div style={{
        background: 'var(--blynx-800)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}>
        <div style={{ 
          display: 'inline-flex', 
          background: 'rgba(237,66,69,0.1)', 
          padding: '16px', 
          borderRadius: '50%',
          marginBottom: '24px',
          border: '1px solid rgba(237,66,69,0.3)'
        }}>
          <ShieldAlert size={36} color="#ed4245" />
        </div>
        
        <h2 style={{ 
          margin: '0 0 16px 0', 
          fontSize: '24px', 
          fontWeight: 800,
          letterSpacing: '-0.5px' 
        }}>
          Age Verification Required
        </h2>
        
        <p style={{ 
          margin: '0 0 32px 0', 
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          fontSize: '15px'
        }}>
          Based on your location, we are required by law to verify that you are at least 18 years of age before you can access Lynxus.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            onClick={handleVerify}
            className="btn-accent"
            style={{ 
              width: '100%', 
              padding: '14px', 
              fontSize: '16px', 
              fontWeight: 700 
            }}
          >
            I am 18 or older
          </button>
          
          <button 
            onClick={handleDecline}
            style={{ 
              width: '100%', 
              padding: '14px', 
              fontSize: '16px', 
              fontWeight: 600,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.borderColor = 'var(--border-bright)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            I am under 18
          </button>
        </div>
      </div>
    </div>
  );
}
