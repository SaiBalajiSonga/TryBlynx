import React, { useState, useRef, useEffect } from 'react';
import { Send, Video } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from '../lib/useWebSocket';
import { useWebRTCStore } from '../store/webrtcStore';

export function ChatRoom() {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const user = useAuthStore((state) => state.user);
  const activeRoomId = useChatStore((state) => state.activeRoomId);
  const messages = useChatStore((state) => activeRoomId ? state.messages[activeRoomId] || [] : []);
  const matchPeerId = useChatStore((state) => state.matchPeerId);
  const startVideo = useWebRTCStore((state) => state.startVideo);
  const { sendMessage } = useWebSocket();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeRoomId) return;

    sendMessage('chat.message', {
      room_id: activeRoomId,
      body: message.trim()
    });
    
    setMessage('');
  };

  if (!activeRoomId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-neutral-500">
        <p>Connecting to chat...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-900 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-emerald-500 mr-3 animate-pulse"></div>
          <h2 className="text-lg font-semibold text-white">Live Match</h2>
        </div>
        {matchPeerId && (
          <button 
            onClick={() => startVideo(matchPeerId, true)}
            className="p-2 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
            title="Start Video Call"
          >
            <Video size={20} />
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          
          return (
            <div key={msg.message_id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2 ${
                isMe 
                  ? 'bg-emerald-500 text-white rounded-2xl rounded-br-sm' 
                  : 'bg-neutral-800 text-neutral-200 rounded-2xl rounded-bl-sm border border-neutral-700'
              }`}>
                {!isMe && (
                  <p className="text-xs text-emerald-400 font-medium mb-1">{msg.sender_name}</p>
                )}
                <p className="break-words text-sm">{msg.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-neutral-900 border-t border-neutral-800">
        <form onSubmit={handleSend} className="flex space-x-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-neutral-800 border border-neutral-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!message.trim()}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-white p-3 rounded-xl transition-colors flex items-center justify-center"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
