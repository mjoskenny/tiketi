export type EventPhase = 'Upcoming' | 'Happening' | 'Ended'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function timestampFor(date: string, time: string) {
  return new Date(`${date}T${time}`).getTime()
}

export function getEventStartTimestamp(date: string, time?: string | null) {
  return timestampFor(date, time || '00:00:00')
}

export function getEventEndTimestamp(date: string, time?: string | null, endTime?: string | null, endDate?: string | null) {
  const startTimestamp = getEventStartTimestamp(date, time)
  const explicitEndTime = !!endTime
  let endTimestamp = timestampFor(endDate || date, endTime || '23:59:59')

  // Keep the historical overnight behavior unless the event has an explicit end date.
  if (!endDate && explicitEndTime && Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp) && endTimestamp <= startTimestamp) {
    endTimestamp += ONE_DAY_MS
  }

  return endTimestamp
}

export function getEventPhase(date: string, time?: string | null, endTime?: string | null, now = Date.now(), endDate?: string | null): EventPhase {
  const startTimestamp = getEventStartTimestamp(date, time)
  const endTimestamp = getEventEndTimestamp(date, time, endTime, endDate)

  if (Number.isFinite(startTimestamp) && now < startTimestamp) return 'Upcoming'
  if (Number.isFinite(endTimestamp) && now >= endTimestamp) return 'Ended'
  return 'Happening'
}

export function hasEventEnded(date: string, time?: string | null, endTime?: string | null, now = Date.now(), endDate?: string | null) {
  return getEventPhase(date, time, endTime, now, endDate) === 'Ended'
}
