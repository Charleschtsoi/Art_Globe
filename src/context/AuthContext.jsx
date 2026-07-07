import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(supabase))

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('is_admin, display_name').eq('id', userId).maybeSingle()
    setProfile(data ?? { is_admin: false, display_name: null })
  }, [])

  useEffect(() => {
    if (!supabase) {
      return
    }

    let cancelled = false
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return
      setSession(s)
      if (s?.user) void loadProfile(s.user.id)
      else setProfile(null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) void loadProfile(s.user.id)
      else setProfile(null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signInWithOAuth = useCallback(async (provider, redirectPath = '/submit') => {
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${redirectPath}` }
    })
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(() => {
    const uid = session?.user?.id
    if (uid) void loadProfile(uid)
  }, [session?.user?.id, loadProfile])

  const value = useMemo(
    () => ({
      authAvailable: isSupabaseConfigured(),
      supabase,
      session,
      user: session?.user ?? null,
      profile,
      isAdmin: Boolean(profile?.is_admin),
      loading,
      signInWithOAuth,
      signOut,
      refreshProfile
    }),
    [session, profile, loading, signInWithOAuth, signOut, refreshProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook colocated with provider (standard pattern).
// eslint-disable-next-line react-refresh/only-export-components -- allow useAuth export beside AuthProvider
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
