import { useEffect } from 'react'
import { BRAND } from '../branding.ts'
import { useSettings } from '../settings/SettingsContext.tsx'

export function BrandChrome() {
  const { branding } = useSettings()
  const icon = branding.siteIcon.url || branding.siteIcon.path || BRAND.icon

  useEffect(() => {
    const href = icon
    const ensure = (rel: string) => {
      let link = document.querySelector<HTMLLinkElement>(`link[rel='${rel}']`)
      if (!link) {
        link = document.createElement('link')
        link.rel = rel
        document.head.appendChild(link)
      }
      link.type = 'image/png'
      link.href = href
    }
    ensure('icon')
    ensure('apple-touch-icon')
  }, [icon])

  return null
}
