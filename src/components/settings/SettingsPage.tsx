import { useState } from 'react'
import { useSettings } from '../../settings/SettingsContext.tsx'
import {
  SETTINGS_CATEGORIES,
  type SettingsCategoryId,
} from '../../types/settings.ts'
import { BrandingPanel } from './BrandingPanel.tsx'
import { DefaultsPanel } from './DefaultsPanel.tsx'
import { FormatPanel } from './FormatPanel.tsx'
import { NumberingPanel } from './NumberingPanel.tsx'
import { SmtpPanel } from './SmtpPanel.tsx'
import './SettingsPage.css'

export function SettingsPage() {
  const { loading, error } = useSettings()
  const [category, setCategory] = useState<SettingsCategoryId>('defaults')

  return (
    <div className="app-page">
      {error ? <p className="api-banner api-banner--error">{error}</p> : null}
      {loading ? <p className="api-banner">Loading settings…</p> : null}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings categories">
          {SETTINGS_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={
                category === entry.id
                  ? 'settings-nav__button is-active'
                  : 'settings-nav__button'
              }
              aria-current={category === entry.id ? 'page' : undefined}
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <div
          className={
            category === 'format' || category === 'email'
              ? 'settings-panel settings-panel--wide'
              : 'settings-panel'
          }
          role="region"
          aria-label="Settings"
        >
          {category === 'defaults' ? <DefaultsPanel /> : null}
          {category === 'email' ? <SmtpPanel /> : null}
          {category === 'branding' ? <BrandingPanel /> : null}
          {category === 'numbering' ? <NumberingPanel /> : null}
          {category === 'format' ? <FormatPanel /> : null}
        </div>
      </div>
    </div>
  )
}
