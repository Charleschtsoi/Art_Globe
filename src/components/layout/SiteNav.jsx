import { Link, useLocation } from 'react-router-dom'
import { GITHUB_URL } from '../../data/siteStats'

export function SiteNav({ t, locale, setLocale, variant = 'dark' }) {
  const location = useLocation()
  const isDark = variant === 'dark'

  const linkClass = (path) => {
    const active = location.pathname === path
    return isDark
      ? `text-sm no-underline ${active ? 'text-amber-400 font-medium' : 'text-amber-100/80 hover:text-amber-300'}`
      : `text-sm no-underline ${active ? 'text-amber-800 font-medium' : 'text-stone-600 hover:text-amber-800'}`
  }

  return (
    <header
      className={
        isDark
          ? 'flex flex-wrap items-center justify-between gap-3 border-b border-amber-900/30 bg-[rgba(18,12,8,0.85)] px-4 py-3 backdrop-blur-sm'
          : 'flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-[#faf8f5]/95 px-4 py-3 backdrop-blur-sm'
      }
    >
      <Link
        to="/"
        className={
          isDark
            ? 'font-serif text-lg text-amber-100 no-underline hover:text-amber-300'
            : 'font-serif text-lg text-stone-900 no-underline hover:text-amber-800'
        }
      >
        Art Globe
      </Link>
      <nav className="flex flex-wrap items-center gap-4">
        <Link to="/explore" className={linkClass('/explore')}>
          {t('nav.explore')}
        </Link>
        <Link to="/about" className={linkClass('/about')}>
          {t('nav.about')}
        </Link>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkClass('')}>
          {t('nav.github')}
        </a>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setLocale('en')}
            aria-pressed={locale === 'en'}
            className={`rounded-md px-2 py-1 text-xs ${
              locale === 'en'
                ? 'border border-amber-500 bg-amber-900/30 text-amber-100'
                : 'border border-transparent text-amber-100/60 hover:text-amber-200'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLocale('zhHant')}
            aria-pressed={locale === 'zhHant'}
            className={`rounded-md px-2 py-1 text-xs ${
              locale === 'zhHant'
                ? 'border border-amber-500 bg-amber-900/30 text-amber-100'
                : 'border border-transparent text-amber-100/60 hover:text-amber-200'
            }`}
          >
            繁
          </button>
        </div>
      </nav>
    </header>
  )
}
