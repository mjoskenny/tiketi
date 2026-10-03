import i18n from './i18n'

export function currentLocale() {
  return i18n.resolvedLanguage?.startsWith('fr') ? 'fr-FR' : 'en-GB'
}

export function formatLocaleDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleDateString(currentLocale(), options)
}

export function formatLocaleTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleTimeString(currentLocale(), options)
}

export function formatLocaleDateTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleString(currentLocale(), options)
}

export function formatLocaleNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(currentLocale(), options).format(value)
}
