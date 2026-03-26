import { test, expect } from '@playwright/test'

test('happy path: app loads, language switcher and timeline visible', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'English' })).toBeVisible()
  await expect(page.getByRole('button', { name: '繁體中文' })).toBeVisible()

  await expect(page.getByRole('complementary', { name: 'Time period filters' })).toBeVisible()

  await page.getByRole('button', { name: '繁體中文' }).click()
  await expect(page.getByRole('complementary', { name: '時期篩選' })).toBeVisible()
})
