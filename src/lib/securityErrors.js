export function describeSecurityError(error) {
  if (['28000', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code) || error?.status === 401 || error?.message === 'LOGIN_REQUIRED') return 'ログインが必要です。セッションを確認して再ログインしてください。'
  if (error?.message === 'STORE_MEMBERSHIP_REQUIRED') return '所属店舗が設定されていません。管理者に店舗への登録を依頼してください。'
  if (error?.code === '42501' || error?.status === 403 || error?.message === 'STORE_ACCESS_DENIED') return 'このデータにはアクセスできません。所属店舗とアクセス権限を管理者に確認してください。'
  return ''
}
