import { test, expect } from '@playwright/test'

test('globe loads artworks on /explore', async ({ page }) => {
  await page.goto('/explore')

  await expect(page.getByRole('button', { name: 'English' })).toBeVisible({ timeout: 15000 })

  // Wait until at least one artwork is loaded (stats show visible > 0)
  await expect(page.getByText(/Visible: [1-9]/)).toBeVisible({ timeout: 30000 })
})
