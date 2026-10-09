import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthRepository, describeAuthError } from './authRepository.js'
import { describeSecurityError } from './securityErrors.js'

test('ログイン前に店舗データAPIを呼ばず、メールとパスワードをAuthへ渡す', async () => {
  const calls = []
  const repository = createAuthRepository({ auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async credentials => { calls.push(credentials); return { error: null } },
  }, rpc: () => { throw new Error('Anonymous data request') } })
  assert.equal(await repository.getSession(), null)
  await repository.signIn(' staff@example.test ', 'password-test-only')
  assert.deepEqual(calls, [{ email: 'staff@example.test', password: 'password-test-only' }])
})

test('保存済みセッションをAuthで検証してから所属店舗を取得する', async () => {
  const calls = []
  const repository = createAuthRepository({ auth: { getUser: async () => { calls.push('verified'); return { data: { user: { id: 'user-a', email: 'staff@example.test' } } } } },
    rpc: async name => { calls.push(name); return { data: [{ store_id: 'store-a', store_name: '店舗A', member_role: 'staff' }] } },
  })
  assert.deepEqual(await repository.getIdentity(), { userId: 'user-a', email: 'staff@example.test', storeId: 'store-a', storeName: '店舗A', role: 'staff' })
  assert.deepEqual(calls, ['verified', 'get_current_store'])
})

test('無効なセッション・所属未設定では店舗を利用できない', async () => {
  const badSession = createAuthRepository({ auth: { getUser: async () => ({ error: { status: 401 } }) }, rpc: () => { throw new Error('Must not call RPC') } })
  await assert.rejects(badSession.getIdentity(), { status: 401 })
  const noMembership = createAuthRepository({ auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) }, rpc: async () => ({ error: { code: '42501', message: 'STORE_MEMBERSHIP_REQUIRED' } }) })
  await assert.rejects(noMembership.getIdentity(), { message: 'STORE_MEMBERSHIP_REQUIRED' })
})

test('ログアウトと購読解除をSDKに委譲し、ログアウト失敗を隠さない', async () => {
  const calls = []
  const repository = createAuthRepository({ auth: {
    onAuthStateChange: callback => { callback('SIGNED_OUT', null); return { data: { subscription: { unsubscribe: () => calls.push('unsubscribe') } } } },
    signOut: async options => { calls.push(options); return { error: null } },
  } })
  const unsubscribe = repository.subscribe((event, session) => calls.push([event, session]))
  await repository.signOut()
  unsubscribe()
  assert.deepEqual(calls, [['SIGNED_OUT', null], { scope: 'local' }, 'unsubscribe'])
  await assert.rejects(createAuthRepository({ auth: { signOut: async () => ({ error: { status: 503 } }) } }).signOut(), { status: 503 })
})

test('未設定でも起動でき、エラーに資格情報・内部情報を表示しない', async () => {
  const repository = createAuthRepository(null)
  assert.equal(repository.configured, false)
  repository.subscribe(() => {})()
  await assert.rejects(repository.signIn('test@example.test', 'private-password'), /Supabaseが設定されていません/)
  assert.match(describeAuthError({ code: 'invalid_credentials' }), /メールアドレスまたはパスワード/)
  assert.match(describeAuthError({ message: 'STORE_MEMBERSHIP_REQUIRED', code: '42501' }), /所属店舗/)
  assert.match(describeSecurityError({ status: 401 }), /ログインが必要/)
  assert.match(describeSecurityError({ code: '42501', message: 'secret error' }), /このデータにはアクセスできません/)
  assert.ok(!describeAuthError({ message: 'private-password' }).includes('private-password'))
})
