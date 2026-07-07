import { test, expect } from '@playwright/test'

test('globe loads artworks on /explore', async ({ page }) => {
  await page.goto('/explore')

  await expect(page.getByRole('button', { name: 'English' })).toBeVisible({ timeout: 15000 })

  // Phase 1: artwork data
  await expect(page.getByTestId('loading-banner-data')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Loading artworks…')).toBeHidden({ timeout: 60000 })

  // Phase 2: thumbnail bootstrap (may be brief or skipped if no remote URLs)
  const thumbsBanner = page.getByTestId('loading-banner-thumbs')
  if (await thumbsBanner.isVisible().catch(() => false)) {
    await expect(thumbsBanner).toBeHidden({ timeout: 60000 })
  }
  await expect(page.getByTestId('globe-bootstrap-scrim')).toBeHidden({ timeout: 60000 })

  await expect(page.getByText(/Visible: [1-9]/)).toBeVisible({ timeout: 30000 })

  const markerImg = page.locator('.art-marker-pin--artwork img').first()
  await expect(markerImg).toBeVisible({ timeout: 15000 })

  // After bootstrap, a majority of visible artwork markers should show HTTPS thumbs
  await expect
    .poll(
      async () => {
        const imgs = page.locator('.art-marker-pin--artwork img')
        const count = await imgs.count()
        if (count === 0) return 0
        let https = 0
        for (let i = 0; i < Math.min(count, 20); i++) {
          const src = await imgs.nth(i).getAttribute('src')
          if (src && src.startsWith('https://')) https += 1
        }
        return https / Math.min(count, 20)
      },
      { timeout: 30000 }
    )
    .toBeGreaterThan(0.5)

  await page.locator('.art-marker-pin--artwork').first().click({ timeout: 15000 })
  await expect(page.getByRole('complementary')).toBeVisible({ timeout: 10000 })

  const panelImg = page.getByTestId('lazy-artwork-image')
  await expect(page.getByTestId('panel-image-loading')).toBeVisible({ timeout: 5000 })

  await expect
    .poll(
      async () => {
        const status = await panelImg.getAttribute('data-status')
        if (status !== 'loaded') return false
        const src = await panelImg.getAttribute('src')
        if (!src || !src.startsWith('https://')) return false
        return panelImg.evaluate((img) => img.naturalWidth > 0)
      },
      { timeout: 45000 }
    )
    .toBe(true)

  await expect(page.getByTestId('panel-image-loading')).toBeHidden()
  await expect(page.getByTestId('panel-image-unavailable')).toBeHidden()

  const loadedSrc = await panelImg.getAttribute('src')
  expect(loadedSrc).toMatch(/^https:\/\//)

  await page.waitForTimeout(2000)
  const srcAfterWait = await panelImg.getAttribute('src')
  expect(srcAfterWait).toMatch(/^https:\/\//)
  await expect(panelImg).toHaveAttribute('data-loading', 'false')
  await expect(panelImg).toHaveAttribute('data-status', 'loaded')
})
