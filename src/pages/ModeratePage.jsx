import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { translate, readStoredLocale } from '../i18n/translations'

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
    maxWidth: 720,
    margin: '0 auto',
    background: 'rgba(32, 22, 14, 0.92)',
    border: '1px solid rgba(212, 168, 83, 0.35)',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
  }
}

function btnStyle(danger = false) {
  return {
    padding: '10px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    border: danger ? '1px solid rgba(240, 120, 100, 0.6)' : '1px solid #d4a853',
    background: danger ? 'rgba(80, 28, 22, 0.85)' : 'rgba(58, 36, 21, 0.95)',
    color: '#f5e6c8',
    fontSize: 14
  }
}

export default function ModeratePage() {
  const locale = useMemo(() => readStoredLocale(), [])
  const t = useCallback((k, v) => translate(locale, k, v), [locale])
  const { authAvailable, user, loading, isAdmin, signInWithOAuth, supabase } = useAuth()

  const [rows, setRows] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [note, setNote] = useState('')
  const [listError, setListError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId])

  const loadPending = useCallback(async () => {
    if (!supabase || !isAdmin) return
    setListError(null)
    const { data, error } = await supabase
      .from('artworks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) {
      setListError(error.message)
      setRows([])
      return
    }
    const next = data ?? []
    setRows(next)
    setSelectedId((sid) => {
      if (!sid || next.some((r) => r.id === sid)) return sid
      return null
    })
  }, [supabase, isAdmin])

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  useEffect(() => {
    let alive = true
    async function signPreview() {
      if (!supabase || !selected?.pending_storage_path) {
        setPreviewUrl('')
        return
      }
      const { data, error } = await supabase.storage
        .from('submission-uploads')
        .createSignedUrl(selected.pending_storage_path, 3600)
      if (!alive) return
      if (error) setPreviewUrl('')
      else setPreviewUrl(data?.signedUrl ?? '')
    }
    void signPreview()
    return () => {
      alive = false
    }
  }, [supabase, selected?.pending_storage_path, selected?.id])

  if (!authAvailable) {
    return (
      <div style={pageStyle()}>
        <div style={cardStyle()}>
          <p>{t('moderate.notConfigured')}</p>
          <Link style={{ color: '#d4a853' }} to="/explore">
            {t('submit.backGlobe')}
          </Link>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={pageStyle()}>
        <div style={cardStyle()}>{t('moderate.loading')}</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={pageStyle()}>
        <div style={cardStyle()}>
          <h1 style={{ marginTop: 0 }}>{t('moderate.title')}</h1>
          <p>{t('moderate.needSignIn')}</p>
          <button type="button" style={btnStyle()} onClick={() => signInWithOAuth('google', '/moderate')}>
            {t('submit.signInGoogle')}
          </button>
          <button type="button" style={{ ...btnStyle(), marginLeft: 8 }} onClick={() => signInWithOAuth('github', '/moderate')}>
            {t('submit.signInGitHub')}
          </button>
          <p style={{ marginTop: 16 }}>
            <Link style={{ color: '#d4a853' }} to="/explore">
              {t('submit.backGlobe')}
            </Link>
          </p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div style={pageStyle()}>
        <div style={cardStyle()}>
          <h1 style={{ marginTop: 0 }}>{t('moderate.title')}</h1>
          <p>{t('moderate.forbidden')}</p>
          <Link style={{ color: '#d4a853' }} to="/explore">
            {t('submit.backGlobe')}
          </Link>
        </div>
      </div>
    )
  }

  const onApprove = async () => {
    if (!selected || !supabase) return
    setActionError(null)
    setBusyId(selected.id)
    try {
      const { data, error } = await supabase.functions.invoke('approve-submission', {
        body: { artworkId: selected.id, reviewerNote: note.trim() }
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error + (data.detail ? `: ${data.detail}` : ''))
      setNote('')
      setSelectedId(null)
      await loadPending()
    } catch (e) {
      setActionError(e?.message || String(e))
    } finally {
      setBusyId(null)
    }
  }

  const onReject = async () => {
    if (!selected || !supabase) return
    setActionError(null)
    setBusyId(selected.id)
    try {
      const { error } = await supabase.rpc('reject_pending_artwork', {
        p_artwork_id: selected.id,
        p_note: note.trim() || null
      })
      if (error) throw error
      setNote('')
      setSelectedId(null)
      await loadPending()
    } catch (e) {
      setActionError(e?.message || String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={pageStyle()}>
      <div style={cardStyle()}>
        <h1 style={{ marginTop: 0, fontSize: 22 }}>{t('moderate.title')}</h1>
        <p style={{ fontSize: 13 }}>
          <Link style={{ color: '#d4a853' }} to="/explore">
            {t('submit.backGlobe')}
          </Link>
        </p>

        {listError && (
          <p role="alert" style={{ color: '#f0a0a0' }}>
            {listError}
          </p>
        )}

        {rows.length === 0 && !listError ? (
          <p>{t('moderate.empty')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0' }}>
            {rows.map((r) => (
              <li key={r.id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border:
                      selectedId === r.id ? '1px solid #d4a853' : '1px solid rgba(212, 168, 83, 0.25)',
                    background: selectedId === r.id ? 'rgba(58, 36, 21, 0.95)' : 'rgba(42, 28, 18, 0.6)',
                    color: '#f5e6c8',
                    cursor: 'pointer'
                  }}
                >
                  <strong>{r.title}</strong> — {r.artist}
                  <span style={{ opacity: 0.75, fontSize: 12 }}>
                    {' '}
                    · {new Date(r.created_at).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div style={{ borderTop: '1px solid rgba(212,168,83,0.2)', paddingTop: 16 }}>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, marginBottom: 12 }}
              />
            ) : (
              <p style={{ fontSize: 13, opacity: 0.8 }}>{t('moderate.noPreview')}</p>
            )}
            <p style={{ margin: '8px 0', fontSize: 14 }}>
              <strong>{selected.title}</strong> — {selected.artist}
            </p>
            <p style={{ fontSize: 13, opacity: 0.9 }}>
              {selected.museum_name}, {selected.city}
              {selected.country ? `, ${selected.country}` : ''}
            </p>
            <p style={{ fontSize: 13 }}>
              {t('moderate.coords', { lat: selected.lat, lng: selected.lng })} · {selected.time_period} ·{' '}
              {selected.year_text || '—'}
            </p>
            {selected.medium ? <p style={{ fontSize: 13 }}>{selected.medium}</p> : null}
            {selected.description ? <p style={{ fontSize: 13 }}>{selected.description}</p> : null}

            <label style={{ display: 'block', fontSize: 12, color: '#a08060', marginTop: 12 }}>
              {t('moderate.reviewerNote')}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{
                width: '100%',
                minHeight: 72,
                boxSizing: 'border-box',
                marginTop: 4,
                borderRadius: 8,
                border: '1px solid rgba(212, 168, 83, 0.35)',
                background: 'rgba(42, 28, 18, 0.75)',
                color: '#f5e6c8',
                padding: 8
              }}
            />

            {actionError && (
              <p role="alert" style={{ color: '#f0a0a0', marginTop: 8 }}>
                {actionError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" style={btnStyle(false)} disabled={busyId === selected.id} onClick={onApprove}>
                {busyId === selected.id ? t('moderate.working') : t('moderate.approve')}
              </button>
              <button type="button" style={btnStyle(true)} disabled={busyId === selected.id} onClick={onReject}>
                {t('moderate.reject')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
