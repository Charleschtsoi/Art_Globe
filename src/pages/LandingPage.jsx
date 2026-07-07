import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { SiteNav } from '../components/layout/SiteNav'
import { SiteFooter } from '../components/layout/SiteFooter'
import { siteStats } from '../data/siteStats'
import { trackCta, trackPageView } from '../lib/analytics'
import { readStoredLocale, writeStoredLocale, translate } from '../i18n/translations'
import { useState } from 'react'

export default function LandingPage() {
  const [locale, setLocale] = useState(() => readStoredLocale())
  const t = (key, vars) => translate(locale, key, vars)

  useEffect(() => {
    writeStoredLocale(locale)
    document.documentElement.lang = locale === 'zhHant' ? 'zh-Hant' : 'en'
    trackPageView('/')
  }, [locale])

  const handleExplore = () => trackCta('explore_globe', '/explore')
  const handleAbout = () => trackCta('how_built', '/about')

  return (
    <div className="min-h-dvh bg-[#faf8f5] text-stone-900">
      <SiteNav t={t} locale={locale} setLocale={setLocale} variant="light" />
      <main>
        <section className="mx-auto max-w-4xl px-6 py-16 text-center md:py-24">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-800">
            {t('landing.eyebrow')}
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-tight text-stone-900 md:text-5xl">
            {t('landing.title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-600">
            {t('landing.subtitle', { count: siteStats.totalArtworks.toLocaleString() })}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/explore"
              onClick={handleExplore}
              className="rounded-full bg-amber-900 px-8 py-3 text-sm font-medium text-amber-50 no-underline shadow-md transition hover:bg-amber-950"
            >
              {t('landing.ctaExplore')}
            </Link>
            <Link
              to="/about"
              onClick={handleAbout}
              className="rounded-full border border-amber-800/30 bg-white px-8 py-3 text-sm font-medium text-amber-900 no-underline transition hover:border-amber-800"
            >
              {t('landing.ctaAbout')}
            </Link>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white py-12">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 px-6 md:grid-cols-4">
            <StatCard label={t('landing.statArtworks')} value={siteStats.totalArtworks.toLocaleString()} />
            <StatCard label={t('landing.statRegions')} value={String(siteStats.regionCount)} />
            <StatCard label={t('landing.statChunks')} value={String(siteStats.totalChunks)} />
            <StatCard
              label={t('landing.statLanguages')}
              value={locale === 'zhHant' ? '2' : '2'}
            />
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-center font-serif text-2xl text-stone-900">{t('landing.pillarsTitle')}</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <PillarCard title={t('landing.pillar1Title')} body={t('landing.pillar1Body')} />
            <PillarCard title={t('landing.pillar2Title')} body={t('landing.pillar2Body')} />
            <PillarCard title={t('landing.pillar3Title')} body={t('landing.pillar3Body')} />
          </div>
        </section>
      </main>
      <SiteFooter t={t} variant="light" />
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="text-center">
      <p className="font-serif text-3xl text-amber-900">{value}</p>
      <p className="mt-1 text-sm text-stone-500">{label}</p>
    </div>
  )
}

function PillarCard({ title, body }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-[#f3efe8] p-6">
      <h3 className="font-serif text-lg text-stone-900">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-stone-600">{body}</p>
    </article>
  )
}
