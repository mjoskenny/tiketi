export type EventPhase = 'Upcoming' | 'Happening' | 'Ended'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function timestampFor(date: string, time: string) {
  return new Date(`${date}T${time}`).getTime()
}

export function getEventStartTimestamp(date: string, time?: string | null) {
  return timestampFor(date, time || '00:00:00')
}

export function getEventEndTimestamp(date: string, time?: string | null, endTime?: string | null) {
  const startTimestamp = getEventStartTimestamp(date, time)
  const explicitEndTime = !!endTime
  let endTimestamp = timestampFor(date, endTime || '23:59:59')

  // An end time earlier than the start time means the event ends the next day.
  if (explicitEndTime && Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp) && endTimestamp <= startTimestamp) {
    endTimestamp += ONE_DAY_MS
  }

  return endTimestamp
}

export function getEventPhase(date: string, time?: string | null, endTime?: string | null, now = Date.now()): EventPhase {
  const startTimestamp = getEventStartTimestamp(date, time)
  const endTimestamp = getEventEndTimestamp(date, time, endTime)

  if (Number.isFinite(startTimestamp) && now < startTimestamp) return 'Upcoming'
  if (Number.isFinite(endTimestamp) && now >= endTimestamp) return 'Ended'
  return 'Happening'
}

export function hasEventEnded(date: string, time?: string | null, endTime?: string | null, now = Date.now()) {
  return getEventPhase(date, time, endTime, now) === 'Ended'
}
