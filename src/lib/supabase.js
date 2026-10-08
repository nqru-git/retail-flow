import { createClient } from '@supabase/supabase-js'

export function initializeSupabase(env = {}) {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    return { client: null, error: 'Supabaseが設定されていません。.env.local に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。' }
  }

  // Reject privileged keys before creating a browser client.
  let role
  try {
    const payload = key.split('.')[1]
    if (payload) role = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role
  } catch { /* Public keys need not be JWTs. */ }
  if (key.startsWith('sb_secret_') || role === 'service_role') {
    return { client: null, error: 'Supabaseのキーが不正です。フロントエンドには公開用のanon keyを設定してください。' }
  }

  try {
    if (!['https:', 'http:'].includes(new URL(url).protocol)) throw new Error('Invalid protocol')
    return {
      client: createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }) },
      }),
      error: '',
    }
  } catch {
    return { client: null, error: 'Supabaseの接続設定が不正です。VITE_SUPABASE_URL と公開用のanon keyを確認してください。' }
  }
}

const configuration = initializeSupabase(import.meta.env ?? {})
export const supabase = configuration.client
export const supabaseConfigurationError = configuration.error
