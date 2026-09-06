import { create } from 'zustand'
import { isSupabaseConfigured } from '@/config/supabase'

interface UiState {
  // Vira true assim que o primeiro pull de sync resolve (ou já nasce true
  // quando não há sync configurado). Serve para decidir skeleton de 1ª carga.
  firstSyncSettled: boolean
  markFirstSyncSettled: () => void
}

export const useUiStore = create<UiState>(set => ({
  firstSyncSettled: !isSupabaseConfigured,
  markFirstSyncSettled: () => set({ firstSyncSettled: true }),
}))
