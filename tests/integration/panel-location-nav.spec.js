import { test, expect } from '@playwright/test'

test.describe('Side panel location navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore')
    await expect(page.getByRole('button', { name: 'English' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Loading artworks…')).toBeHidden({ timeout: 60000 })
    await expect(page.getByText(/Visible: [1-9]/)).toBeVisible({ timeout: 30000 })
  })

  test('Prev/Next cycles artworks when location queue has siblings', async ({ page }) => {
    await page.locator('.art-marker-pin--artwork').first().click({ timeout: 15000 })
    await expect(page.getByRole('complementary')).toBeVisible({ timeout: 10000 })

    const nav = page.getByTestId('panel-location-nav')
    const hasNav = await nav.isVisible().catch(() => false)
    if (!hasNav) {
      test.skip(true, 'Selected marker has no sibling artworks at this location')
    }

    const titleBefore = await page.getByRole('complementary').locator('h3').first().textContent()
    await page.getByTestId('panel-location-next').click()
    await expect
      .poll(async () => page.getByRole('complementary').locator('h3').first().textContent())
      .not.toBe(titleBefore)

    await page.getByTestId('panel-location-prev').click()
    await expect(page.getByRole('complementary').locator('h3').first()).toHaveText(titleBefore ?? '')
  })
})
