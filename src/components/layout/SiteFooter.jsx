import { GITHUB_URL } from '../../data/siteStats'

export function SiteFooter({ t, variant = 'dark' }) {
  const isDark = variant === 'dark'

  return (
    <footer
      className={
        isDark
          ? 'border-t border-amber-900/30 bg-[rgba(12,8,6,0.9)] px-4 py-8 text-center text-sm text-amber-100/70'
          : 'border-t border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-600'
      }
    >
      <p className="m-0">{t('footer.mit')}</p>
      <p className="mt-2 text-xs opacity-80">{t('footer.attribution')}</p>
      <p className="mt-3">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={isDark ? 'text-amber-400 hover:underline' : 'text-amber-800 hover:underline'}
        >
          {t('footer.viewSource')}
        </a>
      </p>
    </footer>
  )
}
