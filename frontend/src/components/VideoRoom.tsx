import { useEffect } from 'react';
import { useWebRTC } from '../lib/useWebRTC';
import { useWebRTCStore } from '../store/webrtcStore';
import { Mic, MicOff, Video, VideoOff, PhoneOff, AlertCircle } from 'lucide-react';

export function VideoRoom({ peerId, isInitiator }: { peerId: string; isInitiator: boolean }) {
  const { endVideo } = useWebRTCStore();
  const {
    localVideoRef,
    remoteVideoRef,
    isMuted,
    isVideoOff,
    error,
    toggleMute,
    toggleVideo,
    initiateCall,
  } = useWebRTC(peerId);

  useEffect(() => {
    if (isInitiator) {
      // Small delay to ensure media is acquired before offering
      const timer = setTimeout(() => initiateCall(), 500);
      return () => clearTimeout(timer);
    }
  }, [isInitiator, initiateCall]);

  return (
    <div className="absolute inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8">
      {error ? (
        <div className="bg-neutral-900 p-8 rounded-3xl border border-neutral-800 text-center max-w-md w-full">
          <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-white mb-2">Camera Access Denied</h3>
          <p className="text-neutral-400 mb-6">{error}</p>
          <button 
            onClick={() => endVideo()}
            className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-medium py-3 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="w-full max-w-6xl aspect-video bg-neutral-900 rounded-3xl border border-neutral-800 overflow-hidden relative shadow-2xl flex flex-col md:flex-row">
          
          {/* Remote Video (Main) */}
          <div className="flex-1 relative bg-black">
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-white text-sm font-medium flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Partner</span>
            </div>
          </div>

          {/* Local Video (PIP or Side) */}
          <div className="w-full md:w-1/3 border-t md:border-t-0 md:border-l border-neutral-800 bg-neutral-950 relative flex flex-col">
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className="flex-1 object-cover w-full bg-black"
            />
            
            {/* Controls */}
            <div className="p-6 bg-neutral-900 border-t border-neutral-800 flex justify-center space-x-4 items-center">
              <button 
                onClick={toggleMute}
                className={`p-4 rounded-full transition-colors ${
                  isMuted ? 'bg-red-500/20 text-red-500' : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                }`}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              
              <button 
                onClick={endVideo}
                className="p-5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors shadow-lg shadow-red-500/20"
              >
                <PhoneOff size={28} />
              </button>

              <button 
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-colors ${
                  isVideoOff ? 'bg-red-500/20 text-red-500' : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                }`}
              >
                {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
