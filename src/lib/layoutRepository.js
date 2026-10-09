import { supabase, supabaseConfigurationError } from './supabase.js'
import { cloneMapElements } from './storeMap.js'
import { validateLayoutSnapshot } from './layoutHistory.js'
import { describeSecurityError } from './securityErrors.js'

export function fromLayoutRow(row) {
  if (!row?.id || !Number.isSafeInteger(row.version_number) || row.version_number < 1 || !row.created_at || !Number.isFinite(Date.parse(row.created_at)) || typeof row.change_note !== 'string' || !validateLayoutSnapshot(row.layout_snapshot)) throw new Error('配置データが不正です。')
  return { id: row.id, versionNumber: row.version_number, createdAt: row.created_at, layoutSnapshot: cloneMapElements(row.layout_snapshot), changeNote: row.change_note }
}

export function describeLayoutError(error) {
  if (describeSecurityError(error)) return describeSecurityError(error)
  if (error?.code === 'LAYOUT_CONFLICT' || error?.message === 'LAYOUT_CONFLICT') return '別の保存で現在の配置が更新されました。編集内容は保持しています。ホームで最新の配置を取得してから、編集し直してください。'
  if (error?.code === 'SUPABASE_NOT_CONFIGURED') return error.message
  if (['PGRST202', '42P01', '42883', 'PGRST204'].includes(error?.code)) return '配置履歴の保存先が未設定です。Supabaseで supabase/layout-history.sql を実行してください。'
  return '配置履歴を取得・保存できませんでした。接続や設定を確認して再試行してください。'
}

export function createLayoutRepository(client) {
  const pending = new Map()
  async function rpc(name, args) {
    if (!client) throw Object.assign(new Error(supabaseConfigurationError), { code: 'SUPABASE_NOT_CONFIGURED' })
    const { data, error } = await client.rpc(name, args)
    if (error) throw error
    return data
  }
  async function getHistory() {
    const rows = await rpc('get_layout_history')
    if (!Array.isArray(rows)) throw new Error('配置履歴が不正です。')
    const history = rows.map(fromLayoutRow).sort((a, b) => a.versionNumber - b.versionNumber)
    if (new Set(history.map((layout) => layout.id)).size !== history.length || new Set(history.map((layout) => layout.versionNumber)).size !== history.length) throw new Error('配置履歴が重複しています。')
    return history
  }
  async function initialize(id, elements) {
    const rows = await rpc('initialize_layout', { p_id: id, p_layout_snapshot: cloneMapElements(elements) })
    return fromLayoutRow(rows?.[0])
  }
  function save(request) {
    if (pending.has(request.id)) return pending.get(request.id)
    const task = (async () => {
      if (!validateLayoutSnapshot(request.layoutSnapshot) || typeof request.changeNote !== 'string' || request.changeNote.length > 1200) throw new Error('配置の入力内容を確認してください。')
      const rows = await rpc('save_layout_version', { p_id: request.id, p_base_id: request.baseId, p_layout_snapshot: cloneMapElements(request.layoutSnapshot), p_change_note: request.changeNote.trim() })
      return fromLayoutRow(rows?.[0])
    })()
    pending.set(request.id, task)
    void task.then(() => pending.delete(request.id), () => pending.delete(request.id))
    return task
  }
  return { getHistory, initialize, save }
}

export const layoutRepository = createLayoutRepository(supabase)
