import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { translate, readStoredLocale, periodLabel } from '../i18n/translations'
import { PERIOD_KEYS } from '../constants/periods'
import { geocodeLocationQuery } from '../services/nominatimGeocode'

const MAX_FILE_BYTES = 8 * 1024 * 1024
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

function pageStyle() {
  return {
    minHeight: '100dvh',
    padding: 24,
    boxSizing: 'border-box',
    background:
      'radial-gradient(ellipse 125% 95% at 50% 32%, #101a3b 0%, #0a1230 26%, #090f24 52%, #060916 76%, #04050f 100%)',
    color: '#f5e6c8',
    fontFamily:
      "'Playfair Display', 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', Georgia, 'Times New Roman', serif"
  }
}

function cardStyle() {
  return {
    maxWidth: 560,
    margin: '0 auto',
    background: 'rgba(32, 22, 14, 0.92)',
    border: '1px solid rgba(212, 168, 83, 0.35)',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
  }
}

function labelStyle() {
  return { display: 'block', fontSize: 12, color: '#a08060', marginBottom: 4 }
}

function inputStyle() {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid rgba(212, 168, 83, 0.35)',
    background: 'rgba(42, 28, 18, 0.75)',
    color: '#f5e6c8',
    fontSize: 14,
    marginBottom: 12
  }
}

function btnStyle(primary = false) {
  return {
    padding: '10px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    border: primary ? '1px solid #d4a853' : '1px solid rgba(212, 168, 83, 0.35)',
    background: primary ? 'rgba(58, 36, 21, 0.95)' : 'rgba(42, 28, 18, 0.75)',
    color: '#f5e6c8',
    fontSize: 14
  }
}

function makeFingerprint(title, artist, museum, lat, lng, uniqueKey) {
  const latN = Number(lat)
  const lngN = Number(lng)
  return [
    String(title).trim().toLowerCase(),
    String(artist).trim().toLowerCase(),
    String(museum).trim().toLowerCase(),
    Number.isFinite(latN) ? latN.toFixed(4) : 'na',
    Number.isFinite(lngN) ? lngN.toFixed(4) : 'na',
    uniqueKey
  ].join('::')
}

function validateAndBuildFiles(fileList) {
  const out = []
  for (const f of fileList) {
    if (f.size > MAX_FILE_BYTES) return { error: 'size', file: f.name }
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXT.has(ext)) return { error: 'type', file: f.name }
    out.push(f)
  }
  return { files: out }
}

export default function SubmitArtPage() {
  const locale = useMemo(() => readStoredLocale(), [])
  const t = useCallback((k, v) => translate(locale, k, v), [locale])
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)

  const [files, setFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])

  const [locationLabel, setLocationLabel] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [museumName, setMuseumName] = useState('')
  const [timePeriod, setTimePeriod] = useState('modern')
  const [yearText, setYearText] = useState('')
  const [medium, setMedium] = useState('')
  const [description, setDescription] = useState('')

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviewUrls(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  const addFilesFromList = (list) => {
    const arr = Array.from(list || []).filter(Boolean)
    const { files: next, error, file } = validateAndBuildFiles(arr)
    if (error === 'size') {
      setMessage({ type: 'err', text: t('submit.fileTooLargeNamed', { name: file }) })
      return
    }
    if (error === 'type') {
      setMessage({ type: 'err', text: t('submit.fileTypeNamed', { name: file }) })
      return
    }
    setMessage(null)
    setSuccessMessage(null)
    setFiles((prev) => [...prev, ...next])
  }

  const removeFileAt = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const resetAll = () => {
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    setLocationLabel('')
    setTitle('')
    setArtist('')
    setMuseumName('')
    setTimePeriod('modern')
    setYearText('')
    setMedium('')
    setDescription('')
  }

  if (!isSupabaseConfigured() || !supabase) {
    return (
      <div style={pageStyle()}>
        <div style={cardStyle()}>
          <p style={{ marginTop: 0 }}>{t('submit.notConfigured')}</p>
          <Link style={{ color: '#d4a853' }} to="/explore">
            {t('submit.backGlobe')}
          </Link>
        </div>
      </div>
    )
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setMessage(null)
    setSuccessMessage(null)

    if (!title.trim() || !artist.trim() || !museumName.trim() || !locationLabel.trim()) {
      setMessage({ type: 'err', text: t('submit.requiredFieldsFrictionless') })
      return
    }
    if (files.length === 0) {
      setMessage({ type: 'err', text: t('submit.requireOneImage') })
      return
    }

    setBusy(true)
    try {
      let geo
      try {
        geo = await geocodeLocationQuery(locationLabel.trim())
      } catch (geoErr) {
        if (String(geoErr?.message) === 'location_not_found' || String(geoErr) === 'location_not_found') {
          setMessage({ type: 'err', text: t('submit.geocodeError') })
          setBusy(false)
          return
        }
        throw geoErr
      }

      const { lat, lng, city, country } = geo

      for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const safeExt = ALLOWED_EXT.has(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg'
        const objectId = crypto.randomUUID()
        const rowId = crypto.randomUUID()
        const storagePath = `submissions/anonymous/${objectId}.${safeExt}`

        const { error: upErr } = await supabase.storage.from('submission-uploads').upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`
        })
        if (upErr) throw upErr

        const fp = makeFingerprint(title.trim(), artist.trim(), museumName.trim(), lat, lng, rowId)

        const { error: insErr } = await supabase.from('artworks').insert({
          id: rowId,
          source_id: `pending-${rowId}`,
          title: title.trim(),
          artist: artist.trim(),
          museum_name: museumName.trim(),
          city: city || locationLabel.trim(),
          country: country || '',
          lat,
          lng,
          time_period: timePeriod,
          source: 'user_submission',
          medium: medium.trim(),
          year_text: yearText.trim(),
          image_url: '',
          canonical_fingerprint: fp,
          confidence: null,
          description: description.trim(),
          status: 'pending',
          pending_storage_path: storagePath
        })
        if (insErr) throw insErr
      }

      setSuccessMessage(t('submit.thanksBody'))
      resetAll()
    } catch (err) {
      setMessage({ type: 'err', text: err?.message || String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={pageStyle()}>
      <div style={cardStyle()}>
        <div
          className="mb-4 flex gap-2 rounded-lg border border-amber-600/30 bg-amber-950/40 px-3 py-2 text-sm text-amber-100/90"
          role="status"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/90"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <p className="m-0 leading-snug italic">{t('submit.curatorBanner')}</p>
        </div>

        {successMessage ? (
          <div
            role="status"
            className="mb-4 rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-sm text-amber-100"
          >
            {successMessage}
          </div>
        ) : null}

        <h1 style={{ marginTop: 0, fontSize: 22 }}>{t('submit.title')}</h1>

        <form onSubmit={onSubmit}>
          <label style={labelStyle()}>{t('submit.fieldLocation')}</label>
          <input
            style={inputStyle()}
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
            placeholder={t('submit.fieldLocationPlaceholder')}
            required
          />

          <p style={labelStyle()}>{t('submit.imagesLabel')}</p>
          <div
            role="presentation"
            onDragEnter={(ev) => {
              ev.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(ev) => {
              ev.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(ev) => {
              ev.preventDefault()
              if (!ev.currentTarget.contains(ev.relatedTarget)) setDragActive(false)
            }}
            onDrop={(ev) => {
              ev.preventDefault()
              setDragActive(false)
              addFilesFromList(ev.dataTransfer?.files)
            }}
            className={`mb-3 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragActive ? 'border-amber-500 bg-amber-950/30' : 'border-amber-600/40 bg-[rgba(42,28,18,0.35)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              id="submit-files-input"
              onChange={(e) => {
                addFilesFromList(e.target.files)
                e.target.value = ''
              }}
            />
            <label htmlFor="submit-files-input" className="cursor-pointer text-sm text-amber-200/95">
              {t('submit.dropHint')} <span className="text-amber-500 underline">{t('submit.browseFiles')}</span>
            </label>
            <p className="mt-1 text-[11px] text-amber-600/90">{t('submit.imagesFormats')}</p>
          </div>

          {previewUrls.length > 0 ? (
            <div
              className="mb-4 flex flex-wrap gap-2"
              style={{ marginBottom: previewUrls.length ? 16 : 0 }}
            >
              {files.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="relative">
                  <img
                    src={previewUrls[idx]}
                    alt=""
                    className="h-20 w-20 rounded-md border border-amber-600/40 object-cover"
                  />
                  <button
                    type="button"
                    aria-label={t('submit.removeImage')}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-amber-700/60 bg-[rgba(32,22,14,0.95)] text-[11px] text-amber-200"
                    onClick={() => removeFileAt(idx)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <label style={labelStyle()}>{t('submit.fieldTitle')}</label>
          <input style={inputStyle()} value={title} onChange={(e) => setTitle(e.target.value)} required />

          <label style={labelStyle()}>{t('submit.fieldArtist')}</label>
          <input style={inputStyle()} value={artist} onChange={(e) => setArtist(e.target.value)} required />

          <label style={labelStyle()}>{t('submit.fieldMuseum')}</label>
          <input style={inputStyle()} value={museumName} onChange={(e) => setMuseumName(e.target.value)} required />

          <label style={labelStyle()}>{t('submit.fieldPeriod')}</label>
          <select style={inputStyle()} value={timePeriod} onChange={(e) => setTimePeriod(e.target.value)}>
            {PERIOD_KEYS.map((k) => (
              <option key={k} value={k}>
                {periodLabel(locale, k)}
              </option>
            ))}
          </select>

          <label style={labelStyle()}>{t('submit.fieldYear')}</label>
          <input style={inputStyle()} value={yearText} onChange={(e) => setYearText(e.target.value)} />

          <label style={labelStyle()}>{t('submit.fieldMedium')}</label>
          <input style={inputStyle()} value={medium} onChange={(e) => setMedium(e.target.value)} />

          <label style={labelStyle()}>{t('submit.fieldDescription')}</label>
          <textarea
            style={{ ...inputStyle(), minHeight: 88, resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {message?.type === 'err' && (
            <p role="alert" style={{ color: '#f0a0a0', fontSize: 14 }}>
              {message.text}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button type="submit" style={btnStyle(true)} disabled={busy}>
              {busy ? t('submit.submitting') : t('submit.submit')}
            </button>
            <Link to="/explore" style={{ ...btnStyle(), textDecoration: 'none', display: 'inline-block', lineHeight: '1.2' }}>
              {t('submit.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
