import { useEffect, useState } from 'react'
import { analysisRepository, describeAnalysisError } from '../lib/analysisRepository.js'
import { supabase, supabaseConfigurationError } from '../lib/supabase.js'

export default function useLayoutAnalysis(beforeId, afterId) {
  const [attempt, setAttempt] = useState(0)
  const [response, setResponse] = useState(null)
  const requestKey = JSON.stringify([beforeId, afterId, attempt])
  const enabled = Boolean(beforeId && afterId && beforeId !== afterId)

  useEffect(() => {
    if (!supabase || !enabled) return
    let active = true
    analysisRepository.getComparison([beforeId, afterId]).then(
      data => { if (active) setResponse({ requestKey, data, error: '' }) },
      error => { if (active) setResponse({ requestKey, data: null, error: describeAnalysisError(error) }) },
    )
    return () => { active = false }
  }, [beforeId, afterId, requestKey, enabled])

  const current = response?.requestKey === requestKey ? response : null
  return {
    data: current?.data ?? null,
    error: !supabase ? supabaseConfigurationError : current?.error ?? '',
    loading: Boolean(supabase && enabled && !current),
    retry: () => setAttempt(value => value + 1),
  }
}
