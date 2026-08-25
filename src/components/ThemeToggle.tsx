import { IconMoon, IconSun } from './icons.tsx'
import { useTheme } from '../theme/ThemeProvider.tsx'
import './ThemeToggle.css'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      <button
        type="button"
        className="theme-toggle__option"
        role="radio"
        aria-checked={theme === 'light'}
        onClick={() => setTheme('light')}
      >
        <IconSun />
        Light
      </button>
      <button
        type="button"
        className="theme-toggle__option"
        role="radio"
        aria-checked={theme === 'dark'}
        onClick={() => setTheme('dark')}
      >
        <IconMoon />
        Dark
      </button>
    </div>
  )
}
