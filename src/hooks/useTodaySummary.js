import { useEffect, useState } from 'react'
import { observationRepository, describeSupabaseError } from '../lib/observationRepository.js'
import { supabase, supabaseConfigurationError } from '../lib/supabase.js'

const loadingSummary = { observedCount: null, purchasedCount: null, status: 'loading', error: '' }
const unconfiguredSummary = { observedCount: null, purchasedCount: null, status: 'unconfigured', error: supabaseConfigurationError }

export default function useTodaySummary(date, refreshVersion) {
  const [attempt, setAttempt] = useState(0)
  const [response, setResponse] = useState(null)
  const requestKey = `${date}:${refreshVersion}:${attempt}`

  useEffect(() => {
    if (!supabase) return
    let active = true
    observationRepository.getTodaySummary(date).then(
      (counts) => { if (active) setResponse({ requestKey, summary: { ...counts, status: 'ready', error: '' } }) },
      (error) => { if (active) setResponse({ requestKey, summary: { observedCount: null, purchasedCount: null, status: 'error', error: describeSupabaseError(error) } }) },
    )
    return () => { active = false }
  }, [date, requestKey])

  const summary = !supabase ? unconfiguredSummary : response?.requestKey === requestKey ? response.summary : loadingSummary
  return { summary, retry: () => setAttempt((current) => current + 1) }
}
