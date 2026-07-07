import { test, expect } from '@playwright/test'

test('globe loads artworks on /explore', async ({ page }) => {
  await page.goto('/explore')

  await expect(page.getByRole('button', { name: 'English' })).toBeVisible({ timeout: 15000 })

  // Wait until initial data bootstrap finishes (loading banner disappears)
  await expect(page.getByText('Loading artworks…')).toBeHidden({ timeout: 60000 })

  // Wait until at least one artwork is loaded (stats show visible > 0)
  await expect(page.getByText(/Visible: [1-9]/)).toBeVisible({ timeout: 30000 })

  // Markers use placeholders on initial render (no remote fetch storm)
  const markerImg = page.locator('.art-marker-pin--artwork img').first()
  await expect(markerImg).toBeVisible({ timeout: 15000 })
  const initialSrc = await markerImg.getAttribute('src')
  expect(initialSrc).not.toMatch(/^https:\/\//)

  // Open an artwork panel by clicking a marker pin
  await page.locator('.art-marker-pin--artwork').first().click({ timeout: 15000 })
  await expect(page.getByRole('complementary')).toBeVisible({ timeout: 10000 })

  // Remote image loads only after user selects an artwork
  const panelImg = page.getByTestId('lazy-artwork-image')
  await expect
    .poll(
      async () => {
        const src = await panelImg.getAttribute('src')
        if (!src || !src.startsWith('https://')) return false
        return panelImg.evaluate((img) => img.naturalWidth > 0)
      },
      { timeout: 45000 }
    )
    .toBe(true)

  const loadedSrc = await panelImg.getAttribute('src')
  expect(loadedSrc).toMatch(/^https:\/\//)

  // Image should stay loaded (no revert to placeholder during hydration)
  await page.waitForTimeout(2000)
  const srcAfterWait = await panelImg.getAttribute('src')
  expect(srcAfterWait).toMatch(/^https:\/\//)
  await expect(panelImg).toHaveAttribute('data-loading', 'false')
})
