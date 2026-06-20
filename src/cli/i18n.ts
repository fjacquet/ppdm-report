import i18next from 'i18next'
import { NAMESPACES, resources } from '../i18n'

/** React-free i18next translator resolving `ns:key`, for the CLI. */
export function createReportT(
  lng: string,
): (key: string, opts?: Record<string, unknown>) => string {
  const instance = i18next.createInstance()
  // i18next v26: no initImmediate option; init is synchronous with inline resources.
  void instance.init({ resources, lng, fallbackLng: 'en', ns: [...NAMESPACES] })
  return (key, opts) => instance.t(key, opts) as string
}
