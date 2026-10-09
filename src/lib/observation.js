import { cloneMapElements } from './storeMap.js'

export const OBSERVATION_EVENTS = {
  stopped: { label: '立ち止まる', icon: 'stop' },
  touchedProduct: { label: '商品に触る', icon: 'touch' },
  checkedPriceTag: { label: '値札を見る', icon: 'tag' },
  triedOn: { label: '試着', icon: 'fitting' },
}

export function observationDate(timestamp) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp))
}

export function createObservationState({ number, layoutVersion, layoutVersionId = null, storeId, elements, startedAt, id }) {
  const mapElements = cloneMapElements(elements)
  return {
    stage: 'observing',
    mapElements,
    undoStack: [],
    beforePurchase: null,
    observation: {
      id: id ?? globalThis.crypto?.randomUUID?.() ?? `observation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      number,
      ...(storeId ? { storeId } : {}),
      startedAt,
      endedAt: null,
      date: observationDate(startedAt),
      layoutVersion,
      layoutVersionId,
      layoutSnapshot: cloneMapElements(mapElements),
      routeSteps: [],
      customerService: { hadService: false, startedAt: null, startedZone: null, sessions: [] },
      result: null,
      purchasedItems: [],
      multiplePurchase: false,
    },
  }
}

export function getPurchaseCandidates(elements, routeSteps) {
  const visitedIds = [...new Set(routeSteps.map((step) => step.zoneId))]
  const sales = elements.filter((element) => element.type === 'sales')
  const visited = visitedIds.map((id) => sales.find((element) => element.id === id)).filter(Boolean)
  const others = sales.filter((element) => !visitedIds.includes(element.id))
  return [...visited, ...others].map((element) => ({
    id: `zone-${element.id}`,
    zoneId: element.id,
    zoneName: element.name,
    productName: element.product.trim() || element.name,
    category: element.category,
    visited: visitedIds.includes(element.id),
  })).concat({ id: 'other', zoneId: null, zoneName: '', productName: 'その他の商品・不明', category: '', visited: false })
}

function withRoute(state, routeSteps) {
  return {
    ...state,
    undoStack: [...state.undoStack, state.observation.routeSteps],
    observation: { ...state.observation, routeSteps },
  }
}

function endService(service, endedAt) {
  const last = service.sessions.at(-1)
  if (!last || last.endedAt) return service
  return { ...service, sessions: [...service.sessions.slice(0, -1), { ...last, endedAt }] }
}

export function observationReducer(state, action) {
  const observation = state.observation
  if (state.stage === 'completed' || state.stage === 'discarded') return state

  switch (action.type) {
    case 'add-route': {
      if (state.stage !== 'observing') return state
      const zone = state.mapElements.find((element) => element.id === action.zoneId)
      if (!zone) return state
      return withRoute(state, [...observation.routeSteps, { zoneId: zone.id, zoneName: zone.name, events: [] }])
    }
    case 'toggle-event': {
      const last = observation.routeSteps.at(-1)
      if (state.stage !== 'observing' || !last || !Object.hasOwn(OBSERVATION_EVENTS, action.event)) return state
      const events = last.events.includes(action.event) ? last.events.filter((event) => event !== action.event) : [...last.events, action.event]
      return withRoute(state, [...observation.routeSteps.slice(0, -1), { ...last, events }])
    }
    case 'undo': {
      if (state.stage !== 'observing' || state.undoStack.length === 0) return state
      return { ...state, undoStack: state.undoStack.slice(0, -1), observation: { ...observation, routeSteps: state.undoStack.at(-1) } }
    }
    case 'start-service': {
      const current = observation.routeSteps.at(-1)
      if (state.stage !== 'observing' || !current) return state
      const startedZone = { zoneId: current.zoneId, zoneName: current.zoneName }
      const previous = observation.customerService
      return {
        ...state,
        stage: 'serving',
        observation: {
          ...observation,
          customerService: {
            hadService: true,
            startedAt: previous.startedAt ?? action.at,
            startedZone: previous.startedZone ?? startedZone,
            sessions: [...previous.sessions, { startedAt: action.at, startedZone, endedAt: null }],
          },
        },
      }
    }
    case 'resume':
      if (state.stage !== 'serving') return state
      return { ...state, stage: 'observing', observation: { ...observation, customerService: endService(observation.customerService, action.at) } }
    case 'begin-purchase':
      if (state.stage !== 'observing' && state.stage !== 'serving') return state
      return {
        ...state,
        stage: 'purchasing',
        beforePurchase: { stage: state.stage, observation },
        observation: { ...observation, endedAt: action.at, customerService: endService(observation.customerService, action.at) },
      }
    case 'cancel-purchase':
      if (state.stage !== 'purchasing') return state
      return { ...state, ...state.beforePurchase, beforePurchase: null }
    case 'complete-purchase': {
      if (state.stage !== 'purchasing') return state
      const ids = [...new Set(action.itemIds)]
      const candidates = getPurchaseCandidates(state.mapElements, observation.routeSteps)
      const items = ids.map((id) => candidates.find((candidate) => candidate.id === id))
      if (items.length === 0 || items.some((item) => !item)) return state
      return {
        ...state,
        stage: 'completed',
        undoStack: [],
        beforePurchase: null,
        observation: {
          ...observation,
          result: 'purchase',
          multiplePurchase: Boolean(action.multiple),
          purchasedItems: items.map(({ id, zoneId, zoneName, productName, category }) => ({ id, zoneId, zoneName, productName, category })),
        },
      }
    }
    case 'complete-no-purchase': {
      if (!['observing', 'serving', 'purchasing'].includes(state.stage)) return state
      const endedAt = observation.endedAt ?? action.at
      return {
        ...state,
        stage: 'completed',
        undoStack: [],
        beforePurchase: null,
        observation: { ...observation, endedAt, customerService: endService(observation.customerService, endedAt), result: 'no-purchase', purchasedItems: [], multiplePurchase: false },
      }
    }
    case 'discard':
      return { stage: 'discarded', observation: null, undoStack: [], mapElements: [], beforePurchase: null }
    default:
      return state
  }
}

export function summarizeObservations(records, date) {
  const today = records.filter((record) => record.date === date && record.endedAt && ['purchase', 'no-purchase'].includes(record.result))
  return { observedCount: today.length, purchasedCount: today.filter((record) => record.result === 'purchase').length }
}
