import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  activePanel: 'home' | 'chat' | 'video' | 'group' | 'dms' | 'notifications' | 'profile' | 'settings';
  toasts: { id: string; type: 'success' | 'error' | 'info'; message: string; onClick?: () => void }[];
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  setActivePanel: (panel: UIState['activePanel']) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string, onClick?: () => void) => void;
  dismissToast: (id: string) => void;

  confirmModal: { isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void } | null;
  alertModal: { isOpen: boolean; title: string; message: string; onClose: () => void } | null;
  showConfirm: (title: string, message: string) => Promise<boolean>;
  showAlert: (title: string, message: string) => Promise<void>;
  closeConfirm: () => void;
  closeAlert: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  activePanel: 'home',
  toasts: [],

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActivePanel: (panel) => set({ activePanel: panel, sidebarOpen: false }),

  showToast: (type, message, onClick) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, type, message, onClick }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  confirmModal: null,
  alertModal: null,

  showConfirm: (title, message) => {
    return new Promise((resolve) => {
      set({
        confirmModal: {
          isOpen: true,
          title,
          message,
          onConfirm: () => {
            set({ confirmModal: null });
            resolve(true);
          },
          onCancel: () => {
            set({ confirmModal: null });
            resolve(false);
          }
        }
      });
    });
  },

  showAlert: (title, message) => {
    return new Promise((resolve) => {
      set({
        alertModal: {
          isOpen: true,
          title,
          message,
          onClose: () => {
            set({ alertModal: null });
            resolve();
          }
        }
      });
    });
  },

  closeConfirm: () => {
    const s = get();
    if (s.confirmModal) s.confirmModal.onCancel();
  },

  closeAlert: () => {
    const s = get();
    if (s.alertModal) s.alertModal.onClose();
  }
}));
