// Headless verification: serves dist/, drives the four sections, checks console errors + fps, saves screenshots.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const PORT = 4199
const srv = spawn('node', ['scripts/serve.mjs', 'dist', String(PORT)], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 600))
fs.mkdirSync('screenshots', { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(`http://localhost:${PORT}/`)
await page.waitForSelector('[data-testid=preview]')
await page.waitForTimeout(600)
const shot = (n) => page.screenshot({ path: `screenshots/${n}.png` })

// 1 DESIGN — pick heart, tweak sliders
await page.click('[data-testid=tab-design]')
await page.locator('.shape-card', { hasText: 'heart' }).first().click()
await page.locator('[data-testid=sl-rot] input[type=range]').fill('12')
await page.locator('[data-testid=sl-squash] input[type=range]').fill('0.2')
await page.waitForTimeout(300)
await shot('01-design')
await page.locator('.shape-card', { hasText: 'neutral' }).first().click()
await page.locator('[data-testid=sl-rot] input[type=range]').fill('0')
await page.locator('[data-testid=sl-squash] input[type=range]').fill('0')

// 2 ANIMATE — look_around, scrub
await page.click('[data-testid=tab-animate]')
await page.selectOption('[data-testid=anim-select]', { label: 'look_around' })
await page.waitForTimeout(200)
const box = await page.locator('.ruler').boundingBox()
await page.mouse.move(box.x + box.width * 0.42, box.y + 10)
await page.mouse.down(); await page.mouse.up()
await page.waitForTimeout(300)
await shot('02-animate')

// 3 SEQUENCE
await page.click('[data-testid=tab-sequence]')
await page.waitForTimeout(300)
const names = async () => page.$$eval('.clip b', (e) => e.map((x) => x.textContent))
const before = await names()
// drag the 2nd clip past the 4th
const c = await page.locator('.clip').nth(1).boundingBox()
const c4 = await page.locator('.clip').nth(3).boundingBox()
await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
await page.mouse.down()
await page.mouse.move(c4.x + c4.width * 0.9, c.y + c.height / 2, { steps: 12 })
await page.mouse.up()
const after = await names()
console.log('reorder before:', before.join(','), '\n         after:', after.join(','))
await page.locator('[data-transition="1"]').click()
await page.click('[data-testid=seq-play]')
await page.waitForTimeout(2200)
await shot('03-sequence')
await page.click('[data-testid=seq-play]')

// export check
await page.click('[data-testid=export-btn]')
await page.click('[data-testid=export-go]', { trial: false }).catch(() => {})
const dl = await Promise.race([page.waitForEvent('download', { timeout: 6000 }).catch(() => null)])
if (dl) { await dl.saveAs('screenshots/sample-export.json'); console.log('export saved', dl.suggestedFilename()) }

// 4 SIMULATOR
await page.click('[data-testid=tab-simulator]')
await page.waitForTimeout(1600)
await page.fill('[data-testid=sim-input]', 'I love you so much, you make me happy!')
await page.click('[data-testid=generate]')
await page.waitForTimeout(500)
await shot('04a-simulator-thinking')
await page.waitForTimeout(2600)
await shot('04-simulator')

// fps probe on simulator
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2) }; requestAnimationFrame(f) }))
console.log('rAF fps (headless, software GL):', fps.toFixed(1))
console.log('mood:', await page.textContent('[data-testid=mood-status]'))
// round-screen mode + resolution + persistence
await page.click('[data-testid=tab-design]')
await page.click('[data-testid=round-btn]')
await page.waitForTimeout(400)
await shot('05-design-round-screen')
await page.reload(); await page.waitForSelector('[data-testid=preview]')
console.log('round mode persisted after reload:', await page.locator('[data-testid=round-btn].on').count() === 1)
await page.locator('[data-testid=round-btn]').locator('xpath=preceding-sibling::button[1]').click()
await page.waitForTimeout(300)
// file:// check
const fp = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const ferr = []; fp.on('pageerror', (e) => ferr.push(e.message)); fp.on('console', (m) => m.type() === 'error' && ferr.push(m.text()))
await fp.goto('file://' + process.cwd() + '/dist/index.html'); await fp.waitForSelector('[data-testid=preview]')
console.log('file:// load errors:', ferr.length ? ferr : 'none')
await fp.close()
console.log('console errors/warnings:', errors.length ? errors : 'none')
await browser.close(); srv.kill()
