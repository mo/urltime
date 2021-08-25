import { chromium } from 'playwright'

import yargs from 'yargs'

const keypress = async () => {
  process.stdin.setRawMode(true)
  return new Promise((resolve) =>
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false)
      resolve()
    })
  )
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const consoleLogWithTimestamp = (msg) =>
  console.log(`${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${msg}`)

const SELECTOR_WAIT_TIMEOUT = 120000

const argv = yargs(process.argv.slice(2))
  .usage('$0 <url>', 'Measure time taken and output size when loading URL')
  .option('timing-from', {
    alias: 'f',
    type: 'string',
    description: 'Measure time FROM when this selector appears',
  })
  .option('timing-to', {
    alias: 't',
    type: 'string',
    description: 'Measure time TO when this selector appears',
  })
  .positional('url', {
    describe: 'url to load',
  })
  .option('visible', {
    type: 'boolean',
    description: 'Show browser (non-headless)',
  })
  .option('remain', {
    type: 'boolean',
    description: 'Wait for keypress before closing browser',
  })
  .option('cookies', {
    type: 'array',
    description: 'Space delimited set of foo=bar pairs that will be set as cookies.',
    default: [],
  }).argv

const browser = await chromium.launch({ headless: !argv.visible })
const context = await browser.newContext()
context.addCookies(
  argv.cookies.map((cookieKeyVal) => {
    const [key, val] = cookieKeyVal.split('=')
    return {
      name: key,
      value: val,
      domain: new URL(argv.url).host,
      path: '/',
    }
  })
)
const page = await context.newPage()
page.on('response', async (response) => {
  const headers = response.headers()
  if ((headers['content-type'] || '').startsWith('application/json')) {
    const body = await response.text()
    let bodyJson
    try {
      bodyJson = JSON.parse(body)
    } catch {
      bodyJson = '<failed to parse json>'
    }
    const url = new URL(response.url())
    consoleLogWithTimestamp(`XHR ${url.pathname} size=${JSON.stringify(bodyJson).length} bytes`)
  }
})

let startTimestamp
if (!argv.timingFrom) {
  startTimestamp = Date.now()
}
await page.goto(argv.url)
if (argv.timingFrom) {
  await page.waitForSelector(argv.timingFrom, { state: 'attached', timeout: SELECTOR_WAIT_TIMEOUT })
  startTimestamp = Date.now()
  consoleLogWithTimestamp(`Found selector ${argv.timingFrom}, starting measurement.`)
}

if (argv.timingTo) {
  await page.waitForSelector(argv.timingTo, { state: 'attached', timeout: SELECTOR_WAIT_TIMEOUT })
  consoleLogWithTimestamp(`Found selector ${argv.timingTo}, stopping measurement.`)
}
const stopTimestamp = Date.now()
const timeTakenMs = stopTimestamp - startTimestamp
await sleepMs(100)
consoleLogWithTimestamp(`Measurement finished. Time taken: ${timeTakenMs} ms`)

if (argv.remain) {
  consoleLogWithTimestamp('Press any key to exit...')
  await keypress()
  process.exit(0)
}

await browser.close()
