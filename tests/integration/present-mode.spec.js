import { test, expect } from '@playwright/test'

test.describe('Present mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore')
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Loading artworks…')).toBeHidden({ timeout: 60000 })
    await expect(page.getByText(/Visible: [1-9]/)).toBeVisible({ timeout: 30000 })
  })

  test('opens from side panel and closes with Escape', async ({ page }) => {
    await page.locator('.art-marker-pin--artwork').first().click({ timeout: 15000 })
    await expect(page.getByRole('complementary')).toBeVisible({ timeout: 10000 })

    await page.getByTestId('present-mode-open').click()
    const overlay = page.getByTestId('present-mode-overlay')
    await expect(overlay).toBeVisible({ timeout: 5000 })
    await expect(overlay.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(overlay).toBeHidden({ timeout: 5000 })
    await expect(page.getByRole('complementary')).toBeVisible()
  })

  test('deep link ?art= opens present overlay', async ({ page }) => {
    await page.goto('/explore?art=2')
    await expect(page.getByTestId('present-mode-overlay')).toBeVisible({ timeout: 90000 })
    await expect(page.getByRole('dialog')).toContainText(/loge|Loge/i, { timeout: 15000 })
  })
})
