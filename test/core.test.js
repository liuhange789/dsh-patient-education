import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LIMITS,
  READING_LEVELS,
  SECTION_TITLES,
  generateGuide,
  normalizeGuideInput,
  readability,
} from '../src/core/guide.js'
import { CASES, inputFragments } from './fixtures.js'

/** Fixed lines the template itself contributes; no input may be needed to produce them. */
const TEMPLATE_LINES = new Set([
  '# 您的就诊须知',
  '## 诊断',
  '## 用药',
  '## 饮食与活动',
  '## 复查',
  '## 什么情况需要立即就医',
  '| 药名 | 怎么吃 | 吃多久 | 注意事项 |',
  '| --- | --- | --- | --- |',
  '医生本次未填写用药。',
  '医生本次未填写饮食与活动方面的要求。',
  '医生本次未填写复查安排。',
  '医生本次未列出需要立即就医的情况。',
])

/**
 * Lines that are neither template nor a restatement of an input value.
 * An empty array proves the guide added nothing of its own.
 */
function extraLines(guide, input) {
  const fragments = inputFragments(input)
  return guide
    .split('\n')
    .filter(line => line !== '')
    .filter(line => !TEMPLATE_LINES.has(line))
    .filter(line => !fragments.some(fragment => line.includes(fragment)))
}

/** Phrases the plugin must never invent on its own. */
const FORBIDDEN = ['建议', '推荐', '可能是', '疑似', '请注意休息', '多喝水', '清淡饮食', '抗生素', '消炎药', '遵医嘱']

test('the three required cases render in the fixed section order', () => {
  for (const input of [CASES.cold, CASES.hypertension, CASES.surgery]) {
    const result = generateGuide(input)
    assert.equal(result.ok, true, result.error)
    assert.match(result.guide_markdown, /^# 您的就诊须知\n/, '标题必须是第一行')
    const positions = SECTION_TITLES.map(title => result.guide_markdown.indexOf(`## ${title}`))
    assert.ok(positions.every(position => position > 0), `缺少章节：${input.diagnosis}`)
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, '章节顺序必须固定')
  }
})

test('the cold case fills every slot from the input and adds nothing', () => {
  const result = generateGuide(CASES.cold)
  assert.equal(result.ok, true)
  const guide = result.guide_markdown

  assert.match(guide, /本次诊断：上呼吸道感染（普通感冒）。/)
  assert.match(guide, /\| 布洛芬缓释胶囊 \| 每次 1 粒，一日两次 \| 3 天 \| 饭后服用 \|/)
  // A medication without note renders the dash placeholder, not invented text.
  assert.match(guide, /\| 氯雷他定片 \| 每次 1 片，每晚一次 \| 5 天 \| — \|/)
  assert.match(guide, /- 多喝温水\n- 避免饮酒\n- 保证睡眠/)
  assert.match(guide, /## 复查\n症状超过 5 天未缓解，请到门诊复查。/)
  assert.match(guide, /## 什么情况需要立即就医\n- 持续高热超过 3 天\n- 呼吸急促或胸闷\n- 意识模糊/)

  assert.deepEqual(extraLines(guide, CASES.cold), [])
  for (const phrase of FORBIDDEN) assert.equal(guide.includes(phrase), false, phrase)
  assert.ok(READING_LEVELS.includes(result.reading_level))
})

test('the hypertension case keeps the long label and the follow-up sentence intact', () => {
  const result = generateGuide(CASES.hypertension)
  assert.equal(result.ok, true)
  const guide = result.guide_markdown

  assert.match(guide, /\| 苯磺酸氨氯地平片 \| 每次 5 mg，每日一次 \| 长期服用 \| 每天固定时间服用，不要自行停药 \|/)
  assert.match(guide, /- 每周至少 5 天中等强度运动，每次 30 分钟/)
  assert.match(guide, /## 复查\n2 周后到高血压门诊复查，带家庭血压记录。/)
  // A follow-up sentence already ends with 。 and must not get a second one.
  assert.equal(guide.includes('。。'), false)

  assert.deepEqual(extraLines(guide, CASES.hypertension), [])
  for (const phrase of FORBIDDEN) assert.equal(guide.includes(phrase), false, phrase)
})

test('the surgery case marks warning signs as bullets and keeps units', () => {
  const result = generateGuide(CASES.surgery)
  assert.equal(result.ok, true)
  const guide = result.guide_markdown

  assert.match(guide, /本次诊断：腹腔镜胆囊切除术后第 3 天。/)
  assert.match(guide, /\| 头孢呋辛酯片 \| 每次 0.25 g，一日两次 \| 5 天 \| 饭后服用，服完为止 \|/)
  assert.match(guide, /- 伤口红肿、渗液或发热超过 38.5℃/)
  assert.match(guide, /- 皮肤或眼白发黄/)

  assert.deepEqual(extraLines(guide, CASES.surgery), [])
  for (const phrase of FORBIDDEN) assert.equal(guide.includes(phrase), false, phrase)
})

test('empty optional inputs produce the explicit absence lines, not invented advice', () => {
  const result = generateGuide({ diagnosis: '急性咽炎' })
  assert.equal(result.ok, true)
  assert.match(result.guide_markdown, /医生本次未填写用药。/)
  assert.match(result.guide_markdown, /医生本次未填写饮食与活动方面的要求。/)
  assert.match(result.guide_markdown, /医生本次未填写复查安排。/)
  assert.match(result.guide_markdown, /医生本次未列出需要立即就医的情况。/)
})

test('a medication with only a name still yields a valid table row', () => {
  const result = generateGuide({ diagnosis: '头痛', medications: [{ name: '对乙酰氨基酚片' }] })
  assert.equal(result.ok, true)
  assert.match(result.guide_markdown, /\| 对乙酰氨基酚片 \| — \| — \| — \|/)
})

test('pipes and newlines in doctor text cannot break the table', () => {
  const input = {
    diagnosis: '  头痛\n\n（紧张型）  ',
    medications: [{ name: 'A|B 片', dosage: '每次 1 片', duration: '3 天' }],
    restrictions: [' 多休息\n不要熬夜 '],
  }
  const result = generateGuide(input)
  assert.equal(result.ok, true)
  assert.match(result.guide_markdown, /本次诊断：头痛 （紧张型）。/)
  assert.match(result.guide_markdown, /\| A\\\|B 片 \|/)
  assert.match(result.guide_markdown, /- 多休息 不要熬夜/)
  // Header + separator + one row: the escaped pipe must not create a column.
  assert.equal(result.guide_markdown.split('\n').filter(line => line.startsWith('|')).length, 3)
})

test('input validation rejects missing, unknown or oversized fields', () => {
  assert.match(normalizeGuideInput({}).error, /diagnosis/)
  assert.match(normalizeGuideInput({ diagnosis: '  ' }).error, /diagnosis/)
  assert.match(normalizeGuideInput({ diagnosis: '感冒', doctor: '张医生' }).error, /未知字段/)
  assert.match(normalizeGuideInput({ diagnosis: '感冒', medications: '阿莫西林' }).error, /medications/)
  assert.match(
    normalizeGuideInput({ diagnosis: '感冒', medications: [{ name: '药', price: 12 }] }).error,
    /未知字段/,
  )
  assert.match(normalizeGuideInput({ diagnosis: '感冒', medications: [{}] }).error, /name/)
  assert.match(normalizeGuideInput({ diagnosis: '感冒', restrictions: [''] }).error, /restrictions\[0\]/)
  assert.match(normalizeGuideInput({ diagnosis: '感冒', warning_signs: [1] }).error, /warning_signs\[0\]/)

  const long = '很'.repeat(LIMITS.diagnosis + 1)
  assert.match(normalizeGuideInput({ diagnosis: long }).error, /200/)
  assert.match(
    normalizeGuideInput({ diagnosis: '感冒', medications: Array.from({ length: LIMITS.medicationCount + 1 }, () => ({ name: '药' })) }).error,
    /最多 20 条/,
  )
})

test('readability follows average sentence length and total length', () => {
  // Two short sentences: 平均句长 5 字。
  assert.equal(readability('本次诊断：感冒。请多休息。').level, '浅显')

  // Two sentences, 39 字 / 2 句 ≈ 20 字。
  const medium = readability('请每天按时服用医生开的药物，并且记录每天的血压数值。复查时请带上这段时间的血压记录。')
  assert.equal(medium.level, '适中')

  // One 40-character sentence.
  const longSentence = readability('本次诊断：这是一句很长的解释，这是一句很长的解释，这是一句很长的解释，这是一句很长的解释。')
  assert.equal(longSentence.level, '偏难')

  // 平均句长 19 字本应是「适中」，但总字数超过 1200 会降一级。
  const many = readability(Array.from({ length: 120 }, () => '今天需要按时服用医生开的药物并记录血压。').join('\n'))
  assert.equal(many.totalChars > 1200, true)
  assert.equal(many.level, '偏难')
})
