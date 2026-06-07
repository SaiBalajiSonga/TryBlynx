import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { Save, Plus, X } from 'lucide-react';

export function SettingsView() {
  const { user, updateUser } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [gender, setGender] = useState(user?.gender || '');
  
  const [interests, setInterests] = useState<string[]>(user?.interests || []);
  const [newInterest, setNewInterest] = useState('');

  const [location, setLocation] = useState(user?.location || '');
  const [language, setLanguage] = useState(user?.language || '');

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleAddInterest = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && newInterest.trim()) {
      e.preventDefault();
      if (!interests.includes(newInterest.trim())) {
        setInterests([...interests, newInterest.trim()]);
      }
      setNewInterest('');
    }
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter(i => i !== interest));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        display_name: displayName,
        bio,
        gender,
        location,
        language,
        interests,
      };

      await api.updateProfile(payload);
      
      // Update global auth store immediately
      updateUser(payload);
      setMessage('Profile updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-neutral-950 text-white">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold">Profile Settings</h2>
          <p className="text-neutral-400 mt-2">Manage your identity and matchmaking preferences.</p>
        </div>

        {message && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl">
            {message}
          </div>
        )}
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-neutral-900 p-8 rounded-2xl border border-neutral-800">
          
          {/* Identity Section */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-emerald-400 mb-4">Identity</h3>
            
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="How should others see you?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                placeholder="Tell us a bit about yourself..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors appearance-none"
              >
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <hr className="border-neutral-800 my-8" />

          {/* Matchmaking Preferences */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-emerald-400 mb-4">Matchmaking Filters</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="e.g. New York, Tokyo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Language</label>
                <input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="e.g. English, Spanish"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Interests</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {interests.map((interest) => (
                  <span key={interest} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {interest}
                    <button type="button" onClick={() => removeInterest(interest)} className="ml-2 hover:text-white transition-colors">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  onKeyDown={handleAddInterest}
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="Type an interest and press Enter"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newInterest.trim() && !interests.includes(newInterest.trim())) {
                      setInterests([...interests, newInterest.trim()]);
                      setNewInterest('');
                    }
                  }}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-3 rounded-xl transition-colors border border-neutral-700"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20"
            >
              <Save size={20} />
              <span>{isSaving ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
