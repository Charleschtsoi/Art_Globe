import { test, expect } from '@playwright/test'

test('happy path: filter, hover tooltip, open and close modal', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Time period filters')).toBeVisible()
  await page.getByLabel('Renaissance').check()

  const marker = page.locator('[data-art-id][data-is-cluster="false"]').first()
  await expect(marker).toBeVisible()

  const markerId = await marker.getAttribute('data-art-id')
  await marker.hover()

  const tooltip = page.locator(`[data-tooltip-for="${markerId}"]`)
  await expect(tooltip).toBeVisible()

  await marker.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await page.getByRole('button', { name: 'Close artwork details modal' }).click()
  await expect(dialog).not.toBeVisible()
})
