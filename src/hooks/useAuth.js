import { useCallback, useEffect, useRef, useState } from 'react'
import { authRepository, describeAuthError } from '../lib/authRepository.js'
import { supabaseConfigurationError } from '../lib/supabase.js'

export default function useAuth() {
  const [state, setState] = useState({ status: authRepository.configured ? 'checking' : 'unconfigured', identity: null, error: supabaseConfigurationError })
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)
  const identityRef = useRef(null)
  const retry = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    if (!authRepository.configured) return
    let active = true
    async function check(session) {
      const ticket = ++generation.current
      if (!session) {
        identityRef.current = null
        setState({ status: 'signed-out', identity: null, error: '' })
        return
      }
      // Token refresh for the same account leaves drafts mounted; membership is revalidated.
      const sameUser = identityRef.current?.userId === session.user?.id
      if (!sameUser) setState({ status: 'checking', identity: null, error: '' })
      try {
        const identity = await authRepository.getIdentity()
        if (active && ticket === generation.current) {
          identityRef.current = identity
          setState({ status: 'ready', identity, error: '' })
        }
      } catch (error) {
        if (active && ticket === generation.current) {
          identityRef.current = null
          setState({ status: 'blocked', identity: null, error: describeAuthError(error) })
        }
      }
    }
    // Keep the Auth callback synchronous; SDK calls run after the internal Auth lock releases.
    const unsubscribe = authRepository.subscribe((event, session) => {
      if (event === 'SIGNED_OUT') {
        ++generation.current
        identityRef.current = null
        if (active) setState({ status: 'signed-out', identity: null, error: '' })
      } else if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
        ++generation.current
        if (identityRef.current && identityRef.current.userId !== session?.user?.id) {
          identityRef.current = null
          setState({ status: 'checking', identity: null, error: '' })
        }
        setTimeout(() => { if (active) void check(session) }, 0)
      }
    })
    void authRepository.getSession().then(session => { if (active) void check(session) }, error => {
      if (active) setState({ status: 'blocked', identity: null, error: describeAuthError(error) })
    })
    return () => { active = false; unsubscribe() }
  }, [attempt])

  return { ...state, retry }
}
