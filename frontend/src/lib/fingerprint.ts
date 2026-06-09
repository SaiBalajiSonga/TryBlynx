import fpPromise from '@fingerprintjs/fingerprintjs';

// Cache the fingerprint so we only generate it once per session
let cachedFingerprint: string | null = null;

export const getDeviceFingerprint = async (): Promise<string> => {
    if (cachedFingerprint) return cachedFingerprint;

    try {
        // Initialize an agent at application startup.
        const fp = await fpPromise.load();

        // Get the visitor identifier when you need it.
        const result = await fp.get();
        
        cachedFingerprint = result.visitorId;
        return cachedFingerprint;
    } catch (err) {
        console.error('Failed to generate device fingerprint', err);
        // Fallback to a naive fingerprint if fingerprintjs fails or is blocked
        const naiveFp = btoa(`${navigator.userAgent}-${navigator.language}-${screen.colorDepth}-${screen.width}x${screen.height}`);
        cachedFingerprint = naiveFp;
        return naiveFp;
    }
};
