import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebSocket } from '../lib/useWebSocket';
import { Settings, LogOut, MessageSquare, Users, Zap, Video, Globe } from 'lucide-react';
import { ChatRoom } from './ChatRoom';
import { SettingsView } from './Settings';
import { Feed } from './Feed';
import { VideoRoom } from './VideoRoom';
import { useWebRTCStore } from '../store/webrtcStore';

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  
  const wsStatus = useChatStore((state) => state.wsStatus);
  const matchStatus = useChatStore((state) => state.matchStatus);
  const targetGender = useChatStore((state) => state.targetGender);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const { isVideoActive, activePeerId, isInitiator } = useWebRTCStore();
  
  const { sendMessage } = useWebSocket();
  const [activeTab, setActiveTab] = useState<'match' | 'chat' | 'settings' | 'feed'>('feed');

  useEffect(() => {
    if (matchStatus === 'matched') {
      setActiveTab('chat');
    }
  }, [matchStatus]);

  const handleFindMatch = () => {
    sendMessage('match.find', { target_gender: 'any' });
  };

  const handleCancelMatch = () => {
    sendMessage('match.cancel', {});
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-white overflow-hidden relative">
      {isVideoActive && activePeerId && (
        <VideoRoom peerId={activePeerId} isInitiator={isInitiator} />
      )}
      {/* Sidebar */}
      <aside className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col">
        <div className="p-6 border-b border-neutral-800">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            TryBlynx
          </h1>
          
          <div className="mt-4 flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected' ? 'bg-green-500' : 
              wsStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
            }`} />
            <span className="text-sm text-neutral-400 capitalize">{wsStatus}</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('feed')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
              activeTab === 'feed' ? 'bg-emerald-500/10 text-emerald-400' : 'text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <Globe size={20} />
            <span className="font-medium">Discover</span>
          </button>
          <button 
            onClick={() => setActiveTab('match')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
              activeTab === 'match' ? 'bg-emerald-500/10 text-emerald-400' : 'text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <Users size={20} />
            <span className="font-medium">Matchmaking</span>
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
              activeTab === 'chat' ? 'bg-emerald-500/10 text-emerald-400' : 'text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <MessageSquare size={20} />
            <span className="font-medium">Messages</span>
          </button>
        </nav>

        <div className="p-4 border-t border-neutral-800">
          <div className="flex items-center space-x-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.username}</p>
              <p className="text-xs text-neutral-500 truncate">{user?.is_vip ? 'VIP Member' : 'Standard User'}</p>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg transition-colors ${
                activeTab === 'settings' ? 'bg-emerald-500 text-white' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
              }`}
            >
              <Settings size={16} />
            </button>
            <button 
              onClick={clearAuth}
              className="flex-1 flex items-center justify-center space-x-2 bg-neutral-800 hover:bg-red-500/20 hover:text-red-400 text-neutral-300 py-2 rounded-lg transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {activeTab === 'feed' ? (
          <Feed />
        ) : activeTab === 'settings' ? (
          <SettingsView />
        ) : activeTab === 'match' ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full text-center space-y-8">
              <div className="inline-flex items-center justify-center p-6 bg-neutral-900 rounded-full border border-neutral-800 shadow-2xl relative">
                {matchStatus === 'waiting' && (
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-500 animate-ping opacity-20"></div>
                )}
                <Video size={64} className={matchStatus === 'waiting' ? 'text-emerald-400' : 'text-neutral-600'} />
              </div>
              
              <div>
                <h2 className="text-3xl font-bold mb-2">Ready to Connect?</h2>
                <p className="text-neutral-400">
                  {matchStatus === 'waiting' 
                    ? `Looking for a match... (${targetGender || 'any'})`
                    : 'Join the matchmaking pool to meet new people instantly.'}
                </p>
              </div>

              {matchStatus === 'waiting' ? (
                <button 
                  onClick={handleCancelMatch}
                  className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center space-x-2"
                >
                  <span>Cancel Search</span>
                </button>
              ) : (
                <button 
                  onClick={handleFindMatch}
                  disabled={wsStatus !== 'connected'}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center space-x-2"
                >
                  <Zap size={20} />
                  <span>Find a Match</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          matchStatus === 'matched' || activeRoomId ? (
            <ChatRoom />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-neutral-500">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-4 opacity-20" />
                <p>Select a conversation to start chatting</p>
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
}
