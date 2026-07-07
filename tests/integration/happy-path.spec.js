import { test, expect } from '@playwright/test'

test('happy path: app loads, language switcher and timeline visible', async ({ page }) => {
  await page.goto('/explore')

  await expect(page.getByRole('button', { name: 'English' })).toBeVisible()
  await expect(page.getByRole('button', { name: '繁體中文' })).toBeVisible()

  await expect(page.getByRole('complementary', { name: 'Time period filters' })).toBeVisible()

  await page.getByRole('button', { name: '繁體中文' }).click()
  await expect(page.getByRole('complementary', { name: '時期篩選' })).toBeVisible()
})

test('landing page has explore CTA', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('link', { name: /Explore Globe|探索地球儀/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /How I built|如何打造/ })).toBeVisible()
})

test('about page shows skills matrix', async ({ page }) => {
  await page.goto('/about')

  await expect(page.getByRole('heading', { name: /How Art Globe was built|Art Globe 如何打造/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Skills matrix|技能矩陣/ })).toBeVisible()
})
