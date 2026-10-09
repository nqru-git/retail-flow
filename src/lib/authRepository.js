import { supabase, supabaseConfigurationError } from './supabase.js'
import { describeSecurityError } from './securityErrors.js'

export function describeAuthError(error) {
  if (error?.code === 'invalid_credentials') return 'メールアドレスまたはパスワードを確認してください。'
  if (error?.code === 'email_not_confirmed') return 'メールアドレスの確認が必要です。管理者に確認してください。'
  if (error?.status === 429) return 'ログインの試行が多すぎます。少し待ってから再試行してください。'
  if (error?.code === 'PGRST202' || error?.code === '42883') return '認証・店舗設定が未完了です。管理者が supabase/security.sql を実行してください。'
  return describeSecurityError(error) || 'ログイン状態を確認できませんでした。接続を確認して再試行してください。'
}

export function createAuthRepository(client) {
  function requireClient() {
    if (!client) throw new Error(supabaseConfigurationError)
    return client
  }
  return {
    configured: Boolean(client),
    subscribe(callback) {
      if (!client) return () => {}
      const { data } = client.auth.onAuthStateChange(callback)
      return () => data.subscription.unsubscribe()
    },
    async getSession() {
      const { data, error } = await requireClient().auth.getSession()
      if (error) throw error
      return data.session
    },
    async getIdentity() {
      // Verify the stored session with Auth; never authorize using local storage alone.
      const { data, error } = await requireClient().auth.getUser()
      if (error) throw error
      const { data: rows, error: membershipError } = await client.rpc('get_current_store')
      if (membershipError) throw membershipError
      const store = rows?.[0]
      if (!data.user?.id || !store?.store_id || !store.store_name || !['owner', 'manager', 'staff'].includes(store.member_role)) throw new Error('INVALID_STORE_MEMBERSHIP')
      return { userId: data.user.id, email: data.user.email, storeId: store.store_id, storeName: store.store_name, role: store.member_role }
    },
    async signIn(email, password) {
      const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    },
    async signOut() {
      const { error } = await requireClient().auth.signOut({ scope: 'local' })
      if (error) throw error
    },
  }
}
export const authRepository = createAuthRepository(supabase)
