import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SiteNav } from '../components/layout/SiteNav'
import { SiteFooter } from '../components/layout/SiteFooter'
import { GITHUB_URL, LIVE_URL, siteStats } from '../data/siteStats'
import { trackPageView } from '../lib/analytics'
import { readStoredLocale, writeStoredLocale, translate } from '../i18n/translations'

const SKILLS = [
  { areaKey: 'about.skillReact', evidenceKey: 'about.evidenceReact' },
  { areaKey: 'about.skill3d', evidenceKey: 'about.evidence3d' },
  { areaKey: 'about.skillData', evidenceKey: 'about.evidenceData' },
  { areaKey: 'about.skillGeo', evidenceKey: 'about.evidenceGeo' },
  { areaKey: 'about.skillPerf', evidenceKey: 'about.evidencePerf' },
  { areaKey: 'about.skillBackend', evidenceKey: 'about.evidenceBackend' },
  { areaKey: 'about.skillDevops', evidenceKey: 'about.evidenceDevops' },
  { areaKey: 'about.skillQa', evidenceKey: 'about.evidenceQa' },
  { areaKey: 'about.skillI18n', evidenceKey: 'about.evidenceI18n' }
]

const CHALLENGES = [
  'about.challenge1',
  'about.challenge2',
  'about.challenge3',
  'about.challenge4'
]

export default function AboutPage() {
  const [locale, setLocale] = useState(() => readStoredLocale())
  const t = (key, vars) => translate(locale, key, vars)

  useEffect(() => {
    writeStoredLocale(locale)
    document.documentElement.lang = locale === 'zhHant' ? 'zh-Hant' : 'en'
    trackPageView('/about')
  }, [locale])

  const generatedDate = new Date(siteStats.generatedAt).toLocaleDateString(
    locale === 'zhHant' ? 'zh-Hant' : 'en',
    { year: 'numeric', month: 'long', day: 'numeric' }
  )

  return (
    <div className="min-h-dvh bg-[#faf8f5] text-stone-900">
      <SiteNav t={t} locale={locale} setLocale={setLocale} variant="light" />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-12">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-800">
            {t('about.eyebrow')}
          </p>
          <h1 className="mt-3 font-serif text-3xl text-stone-900 md:text-4xl">{t('about.title')}</h1>
          <p className="mt-4 leading-relaxed text-stone-600">{t('about.intro')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/explore"
              className="rounded-full bg-amber-900 px-5 py-2 text-sm font-medium text-amber-50 no-underline hover:bg-amber-950"
            >
              {t('landing.ctaExplore')}
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-stone-300 px-5 py-2 text-sm text-stone-700 no-underline hover:border-amber-800"
            >
              {t('nav.github')}
            </a>
          </div>
        </header>

        <section id="data" className="mb-12 rounded-2xl border border-stone-200 bg-white p-6">
          <h2 className="font-serif text-xl text-stone-900">{t('about.dataTitle')}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-stone-500">{t('landing.statArtworks')}</dt>
              <dd className="font-medium text-stone-900">{siteStats.totalArtworks.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-stone-500">{t('landing.statChunks')}</dt>
              <dd className="font-medium text-stone-900">{siteStats.totalChunks}</dd>
            </div>
            <div>
              <dt className="text-stone-500">{t('about.lastPipeline')}</dt>
              <dd className="font-medium text-stone-900">{generatedDate}</dd>
            </div>
            <div>
              <dt className="text-stone-500">{t('about.liveDemo')}</dt>
              <dd>
                <a href={LIVE_URL} className="text-amber-800 hover:underline">
                  {LIVE_URL.replace('https://', '')}
                </a>
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-stone-600">{t('about.dataSources')}</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-stone-600">
            {siteStats.dataSources.map((src) => (
              <li key={src}>{src}</li>
            ))}
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-xl text-stone-900">{t('about.architectureTitle')}</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200 bg-stone-50 p-4 font-mono text-xs leading-relaxed text-stone-700">
            <pre className="m-0 whitespace-pre">{t('about.architectureDiagram')}</pre>
          </div>
        </section>

        <section id="skills" className="mb-12">
          <h2 className="font-serif text-xl text-stone-900">{t('about.skillsTitle')}</h2>
          <div className="mt-6 space-y-4">
            {SKILLS.map(({ areaKey, evidenceKey }) => (
              <article
                key={areaKey}
                className="rounded-xl border border-stone-200 bg-white p-4"
              >
                <h3 className="font-medium text-amber-900">{t(areaKey)}</h3>
                <p className="mt-1 text-sm text-stone-600">{t(evidenceKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="font-serif text-xl text-stone-900">{t('about.challengesTitle')}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-stone-600">
            {CHALLENGES.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter t={t} variant="light" />
    </div>
  )
}
