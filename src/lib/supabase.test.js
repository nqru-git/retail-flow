import assert from 'node:assert/strict'
import test from 'node:test'
import { initializeSupabase } from './supabase.js'

test('環境変数が未設定・片方だけの場合もクラッシュしない', () => {
  for (const env of [{}, { VITE_SUPABASE_URL: 'http://localhost:54321' }, { VITE_SUPABASE_ANON_KEY: 'public-test-key' }]) {
    const result = initializeSupabase(env)
    assert.equal(result.client, null)
    assert.match(result.error, /Supabaseが設定されていません/)
  }
})

test('無効なURLを開発者向けのエラーにする', () => {
  for (const url of ['invalid-url', 'ftp://localhost']) {
    const result = initializeSupabase({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'public-test-key' })
    assert.equal(result.client, null)
    assert.match(result.error, /接続設定が不正/)
  }
})

test('service_role JWTとsecret keyではブラウザクライアントを作らない', () => {
  const jwt = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`
  for (const key of [jwt, 'sb_secret_test-only']) {
    const result = initializeSupabase({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: key })
    assert.equal(result.client, null)
    assert.match(result.error, /公開用のanon key/)
  }
})

test('公開キーの接続設定を受け取り、セッション保存と自動更新を有効にする', () => {
  const result = initializeSupabase({ VITE_SUPABASE_URL: ' http://localhost:54321 ', VITE_SUPABASE_ANON_KEY: ' public-test-key ' })
  assert.ok(result.client)
  assert.equal(result.error, '')
  assert.equal(result.client.auth.persistSession, true)
  assert.equal(result.client.auth.autoRefreshToken, true)
})

test('Publishable keyを優先し、旧anon設定も利用できる', () => {
  const result = initializeSupabase({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only', VITE_SUPABASE_ANON_KEY: 'sb_secret_test-only' })
  assert.ok(result.client)
  assert.equal(result.error, '')
  assert.equal(result.client.supabaseKey, 'sb_publishable_test-only')
})
