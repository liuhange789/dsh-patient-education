import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { CASES } from './fixtures.js'

/** Load the built host entry exactly as the loader does. */
async function loadHost() {
  const mod = await import(pathToFileURL(path.resolve('lib/index.js')).href)
  const tools = {}
  const registrations = []
  const ctx = {
    fiber: { state: 0 },
    tools: { register(tool) { tools[tool.name] = tool; registrations.push(tool.name) } },
    effect(callback) { const dispose = callback(); return typeof dispose === 'function' ? dispose : () => {} },
    on() {},
    logger: console,
    inject() {},
  }
  mod.apply(ctx, {})
  return { mod, tools, registrations }
}

test('host registers generate_patient_guide with the documented input shape', async () => {
  const { mod, registrations, tools } = await loadHost()
  assert.equal(mod.name, 'patient-education')
  assert.deepEqual(registrations, ['generate_patient_guide'])

  const tool = tools.generate_patient_guide
  assert.deepEqual(tool.parameters.required, ['diagnosis'])
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), [
    'diagnosis',
    'followup',
    'medications',
    'restrictions',
    'warning_signs',
  ])
  assert.deepEqual(
    Object.keys(tool.parameters.properties.medications.items.properties).sort(),
    ['dosage', 'duration', 'frequency', 'name', 'note'],
  )
  assert.equal(tool.parameters.properties.medications.items.additionalProperties, false)
  assert.deepEqual(Object.keys(tool.output.schema.properties).sort(), ['guide_markdown', 'reading_level'])
  assert.equal(tool.output.schema.additionalProperties, false)
})

test('execute returns only the two declared fields for all three cases', async () => {
  const { tools } = await loadHost()
  for (const input of [CASES.cold, CASES.hypertension, CASES.surgery]) {
    const result = await tools.generate_patient_guide.execute(input, {})
    assert.deepEqual(Object.keys(result).sort(), ['guide_markdown', 'reading_level'])
    assert.equal(result.guide_markdown.startsWith('# 您的就诊须知\n'), true)
    assert.match(result.guide_markdown, new RegExp(`本次诊断：${input.diagnosis}`))
    assert.ok(['浅显', '适中', '偏难'].includes(result.reading_level))
    assert.equal('ok' in result, false)

    // The rendered text is the guide itself, nothing appended.
    const rendered = tools.generate_patient_guide.output.render(input, result)
    assert.equal(rendered.length, 1)
    assert.equal(rendered[0].type, 'text')
    assert.equal(rendered[0].text, result.guide_markdown)
  }
})

test('the tool refuses input the doctor did not supply', async () => {
  const { tools } = await loadHost()
  await assert.rejects(
    tools.generate_patient_guide.execute({}, {}),
    /diagnosis/,
  )
  // The DSH tool-argument validator rejects an undeclared medication field
  // before the core sees it.
  await assert.rejects(
    tools.generate_patient_guide.execute({ diagnosis: '感冒', medications: [{ name: '药', advice: '多喝水' }] }, {}),
    /not a declared property/,
  )
  await assert.rejects(
    tools.generate_patient_guide.execute({ diagnosis: '感冒', restrictions: [''] }, {}),
    /restrictions\[0\]/,
  )
})

test('presentCall summarises the input without inventing content', async () => {
  const { tools } = await loadHost()
  const call = tools.generate_patient_guide.presentCall(CASES.hypertension)
  assert.equal(call.card, 'generic')
  assert.equal(call.rawInput.diagnosis, CASES.hypertension.diagnosis)
  assert.equal(call.rawInput.medications, 1)
  assert.equal(call.rawInput.warning_signs, 3)
})
