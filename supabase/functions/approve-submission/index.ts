/**
 * Edge Function: approve a pending user submission (admin only).
 * Copies image submission-uploads -> art-images, inserts public.artworks, marks submission approved.
 *
 * Deploy: `supabase functions deploy approve-submission --no-verify-jwt` is WRONG — verify JWT.
 *   supabase functions deploy approve-submission
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

function canonicalFingerprint(row: {
  title: string
  artist: string
  museum_name: string
  lat: number
  lng: number
}) {
  const lat = Number(row.lat)
  const lng = Number(row.lng)
  return [
    String(row.title ?? '')
      .trim()
      .toLowerCase(),
    String(row.artist ?? '')
      .trim()
      .toLowerCase(),
    String(row.museum_name ?? '')
      .trim()
      .toLowerCase(),
    Number.isFinite(lat) ? lat.toFixed(3) : 'na',
    Number.isFinite(lng) ? lng.toFixed(3) : 'na'
  ].join('::')
}

function extFromPath(p: string) {
  const m = p.match(/\.([a-zA-Z0-9]+)$/)
  const e = (m?.[1] ?? 'jpg').toLowerCase()
  if (e === 'jpeg') return 'jpg'
  return e
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const jwt = authHeader.replace('Bearer ', '')
    const svc = createClient(supabaseUrl, serviceKey)
    const { data: userData, error: userErr } = await svc.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }
    const uid = userData.user.id

    const admin = svc
    const { data: profile, error: profErr } = await admin.from('profiles').select('is_admin').eq('id', uid).maybeSingle()
    if (profErr || !profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json().catch(() => ({}))
    const artworkId = body?.artworkId as string | undefined
    const submissionId = body?.submissionId as string | undefined
    const reviewerNote = (body?.reviewerNote as string | undefined) ?? ''

    /** Pending row already in public.artworks (direct submit flow). */
    if (artworkId) {
      const { data: row, error: rowErr } = await admin
        .from('artworks')
        .select('*')
        .eq('id', artworkId)
        .eq('status', 'pending')
        .maybeSingle()

      if (rowErr || !row) {
        return new Response(JSON.stringify({ error: 'Artwork not found or not pending' }), {
          status: 404,
          headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const path = row.pending_storage_path as string | null
      if (!path || !path.startsWith('submissions/')) {
        return new Response(JSON.stringify({ error: 'Invalid or missing pending storage path' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const { data: blob, error: dlErr } = await admin.storage.from('submission-uploads').download(path)
      if (dlErr || !blob) {
        return new Response(JSON.stringify({ error: 'Could not read uploaded image', detail: dlErr?.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const ext = extFromPath(path)
      const destPath = `user-submissions/${artworkId}.${ext}`
      const buf = await blob.arrayBuffer()
      const ct =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'gif'
              ? 'image/gif'
              : 'image/jpeg'

      const { error: upErr } = await admin.storage.from('art-images').upload(destPath, buf, {
        contentType: ct,
        upsert: true
      })
      if (upErr) {
        return new Response(JSON.stringify({ error: 'Upload to art-images failed', detail: upErr.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      const { data: pub } = admin.storage.from('art-images').getPublicUrl(destPath)
      const imageUrl = pub.publicUrl
      const newSourceId = `user-sub-${artworkId}`

      const { error: updArtErr } = await admin
        .from('artworks')
        .update({
          source_id: newSourceId,
          image_url: imageUrl,
          pending_storage_path: null,
          status: 'approved',
          reviewer_note: reviewerNote || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: uid
        })
        .eq('id', artworkId)

      if (updArtErr) {
        return new Response(JSON.stringify({ error: 'Failed to finalize artwork', detail: updArtErr.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ ok: true, sourceId: newSourceId, imageUrl }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    if (!submissionId) {
      return new Response(JSON.stringify({ error: 'submissionId or artworkId required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const { data: sub, error: subErr } = await admin
      .from('user_artwork_submissions')
      .select('*')
      .eq('id', submissionId)
      .eq('status', 'pending')
      .maybeSingle()

    if (subErr || !sub) {
      return new Response(JSON.stringify({ error: 'Submission not found or not pending' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const path = sub.image_storage_path as string
    if (!path.startsWith('submissions/')) {
      return new Response(JSON.stringify({ error: 'Invalid storage path' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const { data: blob, error: dlErr } = await admin.storage.from('submission-uploads').download(path)
    if (dlErr || !blob) {
      return new Response(JSON.stringify({ error: 'Could not read uploaded image', detail: dlErr?.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const ext = extFromPath(path)
    const destPath = `user-submissions/${submissionId}.${ext}`
    const buf = await blob.arrayBuffer()
    const ct =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg'

    const { error: upErr } = await admin.storage.from('art-images').upload(destPath, buf, {
      contentType: ct,
      upsert: true
    })
    if (upErr) {
      return new Response(JSON.stringify({ error: 'Upload to art-images failed', detail: upErr.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const { data: pub } = admin.storage.from('art-images').getPublicUrl(destPath)
    const imageUrl = pub.publicUrl

    const sourceId = `user-sub-${submissionId}`
    const fp = canonicalFingerprint({
      title: sub.title,
      artist: sub.artist,
      museum_name: sub.museum_name,
      lat: Number(sub.lat),
      lng: Number(sub.lng)
    })

    const artworkRow = {
      source_id: sourceId,
      title: sub.title,
      artist: sub.artist,
      museum_name: sub.museum_name,
      city: sub.city,
      country: sub.country ?? '',
      lat: Number(sub.lat),
      lng: Number(sub.lng),
      time_period: sub.time_period ?? 'modern',
      source: 'user_submission',
      medium: sub.medium ?? '',
      year_text: sub.year_text ?? '',
      image_url: imageUrl,
      canonical_fingerprint: fp,
      confidence: null,
      description: sub.description ?? '',
      submission_id: submissionId,
      status: 'approved'
    }

    const { error: insErr } = await admin.from('artworks').insert(artworkRow)
    if (insErr) {
      return new Response(JSON.stringify({ error: 'Insert artwork failed', detail: insErr.message }), {
        status: 409,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    const { error: updErr } = await admin
      .from('user_artwork_submissions')
      .update({
        status: 'approved',
        reviewer_note: reviewerNote || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: uid
      })
      .eq('id', submissionId)

    if (updErr) {
      return new Response(JSON.stringify({ error: 'Approved artwork but failed to update submission', detail: updErr.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ ok: true, sourceId, imageUrl }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
