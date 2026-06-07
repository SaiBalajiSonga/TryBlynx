import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { type UserProfile } from '../store/authStore';
import { MapPin, Sparkles, Loader2 } from 'lucide-react';

interface FeedPost {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: UserProfile;
}

export function Feed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFeed();
  }, []);

  const loadFeed = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await api.getFeed();
      setPosts(data.posts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load feed');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-neutral-950">
        <Loader2 className="animate-spin text-emerald-500 mb-4" size={32} />
        <p className="text-neutral-400">Loading discovery feed...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-neutral-950">
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl max-w-md text-center">
          <p>{error}</p>
          <button onClick={loadFeed} className="mt-4 px-4 py-2 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors text-white font-medium">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-neutral-950 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold">Discovery Feed</h2>
            <p className="text-neutral-400 mt-2">See what's happening around the community.</p>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-20 bg-neutral-900 rounded-2xl border border-neutral-800">
            <Sparkles size={48} className="mx-auto mb-4 text-emerald-500/50" />
            <h3 className="text-xl font-medium mb-2">It's quiet here</h3>
            <p className="text-neutral-500">Be the first to share something with the community.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => {
              const author = post.author;
              const isVip = author?.is_vip;

              return (
                <div 
                  key={post.id} 
                  className={`bg-neutral-900 rounded-2xl p-6 border ${
                    isVip ? 'border-yellow-500/50 shadow-lg shadow-yellow-500/10' : 'border-neutral-800'
                  } flex flex-col transition-all hover:-translate-y-1 hover:shadow-xl`}
                >
                  <div className="flex items-start space-x-4 mb-4">
                    <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-lg font-bold ${
                      isVip 
                        ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-neutral-900' 
                        : 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white'
                    }`}>
                      {author?.avatar_url ? (
                        <img src={author.avatar_url} alt={author.display_name || 'Avatar'} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        (author?.display_name || author?.username || 'U').charAt(0).toUpperCase()
                      )}
                    </div>
                    
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center space-x-2">
                        <h4 className="font-semibold text-white truncate">
                          {author?.display_name || author?.username || 'Unknown User'}
                        </h4>
                        {isVip && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-yellow-500/20 text-yellow-500 border border-yellow-500/30">
                            VIP
                          </span>
                        )}
                      </div>
                      {author?.location && (
                        <div className="flex items-center text-xs text-neutral-500 mt-1">
                          <MapPin size={12} className="mr-1" />
                          <span className="truncate">{author.location}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-neutral-300 text-sm mb-4 flex-1 whitespace-pre-wrap leading-relaxed">
                    {post.body}
                  </p>

                  {author?.interests && author.interests.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-neutral-800/50">
                      {author.interests.slice(0, 4).map((interest, i) => (
                        <span key={i} className="px-2 py-1 bg-neutral-800 text-neutral-400 text-xs rounded-md border border-neutral-700/50">
                          {interest}
                        </span>
                      ))}
                      {author.interests.length > 4 && (
                        <span className="px-2 py-1 bg-neutral-800 text-neutral-500 text-xs rounded-md">
                          +{author.interests.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
