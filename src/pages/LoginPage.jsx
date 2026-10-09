import { useState } from 'react'
import { authRepository, describeAuthError } from '../lib/authRepository.js'
import './Login.css'

export default function LoginPage({ status, error, onRetry, onLogout }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function login(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFormError('')
    try {
      await authRepository.signIn(email, password)
      setPassword('')
      onRetry()
    } catch (failure) {
      setFormError(describeAuthError(failure))
    } finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true)
    try { await authRepository.signOut(); onLogout?.(); onRetry() } catch (failure) { setFormError(describeAuthError(failure)) }
    finally { setBusy(false) }
  }
  const checking = status === 'checking'
  const unavailable = status === 'unconfigured'
  return (
    <div className="app-shell login-shell">
      <main className="login-page" aria-busy={busy || checking}>
        <p className="eyebrow">Retail Flow</p>
        <h1>ログイン</h1>
        <p>所属店舗のアカウントでログインしてください。</p>
        {checking && <p role="status">ログイン状態を確認中…</p>}
        {(formError || error) && <p className="login-error" role="alert">{formError || error}</p>}
        <form onSubmit={login}>
          <fieldset disabled={busy || checking || unavailable}>
            <label htmlFor="login-email">メールアドレス</label>
            <input id="login-email" name="email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={event => setEmail(event.target.value)} />
            <label htmlFor="login-password">パスワード</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
            <button className="login-button" type="submit">{busy ? 'ログイン中…' : 'ログイン'}</button>
          </fieldset>
        </form>
        {status === 'blocked' && <div className="login-recovery"><button type="button" disabled={busy} onClick={onRetry}>ログイン状態を再確認</button><button type="button" disabled={busy} onClick={logout}>ログアウト</button></div>}
      </main>
    </div>
  )
}
