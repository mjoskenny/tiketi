import { supabase } from './supabase'

const FAVORITES_KEY_PREFIX = 'tiketi-favorite-events'
let activeUserId: string | null = null

function favoritesKey() {
  return `${FAVORITES_KEY_PREFIX}:${activeUserId ?? 'guest'}`
}

export function setFavoriteUser(userId: string | null) {
  activeUserId = userId
  window.dispatchEvent(new CustomEvent('tiketi:favorites-changed'))
}

export function getFavoriteEventIds(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(favoritesKey()) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function isFavoriteEvent(id: string) {
  return getFavoriteEventIds().includes(id)
}

export function replaceFavoriteEventIds(ids: string[]) {
  window.localStorage.setItem(favoritesKey(), JSON.stringify(Array.from(new Set(ids))))
  window.dispatchEvent(new CustomEvent('tiketi:favorites-changed'))
}

export async function toggleFavoriteEvent(id: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    window.dispatchEvent(new CustomEvent('tiketi:require-auth', {
      detail: {
        title: 'Sign in to save events',
        message: 'Create an account to bookmark events you love.',
      },
    }))
    return false
  }

  const ids = getFavoriteEventIds()
  const next = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]
  window.localStorage.setItem(favoritesKey(), JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('tiketi:favorites-changed'))
  try {
    await syncFavoriteEvent(id, next.includes(id))
  } catch {
    window.localStorage.setItem(favoritesKey(), JSON.stringify(ids))
    window.dispatchEvent(new CustomEvent('tiketi:favorites-changed'))
    return ids.includes(id)
  }
  return next.includes(id)
}

export async function syncFavoriteEvent(eventId: string, favorite: boolean) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  if (favorite) {
    const { error } = await supabase.from('event_favorites').upsert({ user_id: user.id, event_id: eventId }, { onConflict: 'user_id,event_id' })
    if (error) throw error
  } else {
    const { error } = await supabase.from('event_favorites').delete().eq('user_id', user.id).eq('event_id', eventId)
    if (error) throw error
  }
}
