import assert from 'node:assert/strict'
import {
  composeTeachingSummary,
  getTeachingSummary,
  hasSubstantiveText,
  isBoilerplateLocationLine
} from '../src/lib/teachingSummary.js'
import { translate } from '../src/i18n/translations.js'

const t = (key, vars) => translate('en', key, vars)

assert.equal(isBoilerplateLocationLine('Located at Courtauld Institute of Art.'), true)
assert.equal(hasSubstantiveText('Located at Courtauld Institute of Art.'), false)
assert.equal(
  hasSubstantiveText(
    'Renoir painted this scene of a Paris theatre box, exploring modern leisure in the 1870s.'
  ),
  true
)

const sample = {
  title: 'La loge',
  artist: 'Pierre-Auguste Renoir',
  creation_year: '1874',
  medium: 'oil on canvas',
  museumName: 'Courtauld Gallery',
  current_location: { city: 'London', country: 'United Kingdom' },
  time_period: 'impressionism',
  historical_text: 'Located at Courtauld Institute of Art.'
}

const composed = composeTeachingSummary(sample, t)
assert.match(composed, /La loge/i)
assert.match(composed, /Renoir/i)
assert.match(composed, /Courtauld Gallery/i)

const summary = getTeachingSummary(sample, { t })
assert.equal(summary, composed)

const rich = { ...sample, historical_text: 'A key Impressionist work depicting theatre culture.' }
assert.equal(getTeachingSummary(rich, { t }), rich.historical_text)

console.log('teachingSummary: all assertions passed')
