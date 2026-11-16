/**
 * Core of dsh-patient-education. Turns decisions a doctor has already made into
 * a plain-language after-visit guide.
 *
 * The module is pure: no I/O, no model call, no lookup tables of medical
 * knowledge. Every patient-facing sentence is a hard-coded template; the only
 * variable text is the caller's input, copied verbatim (whitespace collapsed,
 * Markdown table pipes escaped). Nothing here interprets, recommends, or adds a
 * statement the doctor did not write down.
 *
 * @module dsh-patient-education/core
 */

/** Reading level labels, easiest first. */
export const READING_LEVELS = ['浅显', '适中', '偏难']

/** Section order is part of the product contract. */
export const SECTION_TITLES = ['诊断', '用药', '饮食与活动', '复查', '什么情况需要立即就医']

/** Hard caps, so one pasted block cannot produce an unreadable handout. */
export const LIMITS = {
  diagnosis: 200,
  medicationField: 80,
  medicationNote: 160,
  medicationCount: 20,
  restriction: 200,
  followup: 300,
  warningSign: 200,
  listCount: 20,
}

/** Fields a medication object may carry; anything else is rejected. */
const MEDICATION_FIELDS = ['name', 'dosage', 'frequency', 'duration', 'note']

/** Top-level fields the tool accepts. */
const INPUT_FIELDS = ['diagnosis', 'medications', 'restrictions', 'followup', 'warning_signs']

/** Missing value placeholder used in the medication table. */
const EMPTY = '—'

/** A statement about an empty input section; never a medical claim. */
const ABSENT = {
  medications: '医生本次未填写用药。',
  restrictions: '医生本次未填写饮食与活动方面的要求。',
  followup: '医生本次未填写复查安排。',
  warningSigns: '医生本次未列出需要立即就医的情况。',
}

/**
 * Trim, collapse whitespace/newlines and enforce a length cap.
 * Newlines are folded into spaces: a handout is a linear document and a pasted
 * block must not break the Markdown table or smuggle extra sections in.
 * @param {unknown} value - raw field.
 * @param {number} max - character cap.
 * @param {string} label - field name used in the error message.
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function cleanText(value, max, label) {
  if (typeof value !== 'string') return { ok: false, error: `${label}必须是字符串` }
  const text = value.replace(/\s+/g, ' ').trim()
  if (text === '') return { ok: false, error: `${label}不能为空` }
  if (text.length > max) return { ok: false, error: `${label}超过 ${max} 字` }
  return { ok: true, value: text }
}

/**
 * Escape the only Markdown syntax that could break the medication table.
 * @param {string} text - clean input text.
 * @returns {string} table-safe cell.
 */
function cell(text) {
  return text.replace(/\|/g, '\\|')
}

/**
 * Append a full stop when the doctor's sentence has no terminal punctuation, so
 * the diagnosis always reads as one sentence.
 * @param {string} text - clean diagnosis.
 * @returns {string} one sentence.
 */
function sentence(text) {
  return /[。！？!?]$/.test(text) ? text : `${text}。`
}

/**
 * Validate and normalise the tool arguments.
 * Unknown keys are rejected instead of ignored: silently dropping a field the
 * caller thought was supported would let it believe a statement was delivered.
 * @param {unknown} raw - tool arguments.
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function normalizeGuideInput(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '入参必须是对象' }
  }
  for (const key of Object.keys(raw)) {
    if (!INPUT_FIELDS.includes(key)) return { ok: false, error: `未知字段：${key}` }
  }

  const diagnosis = cleanText(raw.diagnosis, LIMITS.diagnosis, 'diagnosis')
  if (!diagnosis.ok) return diagnosis

  const medications = []
  const rawMedications = raw.medications ?? []
  if (!Array.isArray(rawMedications)) return { ok: false, error: 'medications 必须是数组' }
  if (rawMedications.length > LIMITS.medicationCount) {
    return { ok: false, error: `medications 最多 ${LIMITS.medicationCount} 条` }
  }
  for (const [index, entry] of rawMedications.entries()) {
    const at = `medications[${index}]`
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, error: `${at} 必须是对象` }
    }
    for (const key of Object.keys(entry)) {
      if (!MEDICATION_FIELDS.includes(key)) return { ok: false, error: `${at} 未知字段：${key}` }
    }
    const name = cleanText(entry.name, LIMITS.medicationField, `${at}.name`)
    if (!name.ok) return name
    const medication = { name: name.value, dosage: '', frequency: '', duration: '', note: '' }
    for (const field of ['dosage', 'frequency', 'duration']) {
      if (entry[field] === undefined || entry[field] === null) continue
      const cleaned = cleanText(entry[field], LIMITS.medicationField, `${at}.${field}`)
      if (!cleaned.ok) return cleaned
      medication[field] = cleaned.value
    }
    if (entry.note !== undefined && entry.note !== null) {
      const cleaned = cleanText(entry.note, LIMITS.medicationNote, `${at}.note`)
      if (!cleaned.ok) return cleaned
      medication.note = cleaned.value
    }
    medications.push(medication)
  }

  /**
   * Normalise one list of doctor-written lines.
   * @param {unknown} value - raw list.
   * @param {number} max - per-line cap.
   * @param {number} maxCount - list cap.
   * @param {'restrictions' | 'warning_signs'} label - field name.
   * @returns {{ ok: true, value: string[] } | { ok: false, error: string }}
   */
  const list = (value, max, maxCount, label) => {
    if (value === undefined || value === null) return { ok: true, value: [] }
    if (!Array.isArray(value)) return { ok: false, error: `${label} 必须是数组` }
    if (value.length > maxCount) return { ok: false, error: `${label} 最多 ${maxCount} 条` }
    const out = []
    for (const [index, entry] of value.entries()) {
      const cleaned = cleanText(entry, max, `${label}[${index}]`)
      if (!cleaned.ok) return cleaned
      out.push(cleaned.value)
    }
    return { ok: true, value: out }
  }

  const restrictions = list(raw.restrictions, LIMITS.restriction, LIMITS.listCount, 'restrictions')
  if (!restrictions.ok) return restrictions

  const warningSigns = list(raw.warning_signs, LIMITS.warningSign, LIMITS.listCount, 'warning_signs')
  if (!warningSigns.ok) return warningSigns

  let followup = ''
  if (raw.followup !== undefined && raw.followup !== null) {
    const cleaned = cleanText(raw.followup, LIMITS.followup, 'followup')
    if (!cleaned.ok) return cleaned
    followup = cleaned.value
  }

  return {
    ok: true,
    value: {
      diagnosis: diagnosis.value,
      medications,
      restrictions: restrictions.value,
      followup,
      warningSigns: warningSigns.value,
    },
  }
}

/**
 * Count characters that carry reading effort: everything but whitespace and
 * punctuation. Latin digits count too ("7 天", "5 mg"), so the measure is
 * script-neutral.
 * @param {string} text - prose without Markdown.
 * @returns {number} character count.
 */
function charCount(text) {
  return text.replace(/[\s，。！？、；：,.!?;:（）()「」『』“”"'—\-/|]/g, '').length
}

/**
 * Split prose into sentence units. The table is flattened first so a cell is
 * not silently glued to the next one.
 * @param {string} prose - Markdown-free prose.
 * @returns {string[]} non-empty sentences.
 */
function sentencesOf(prose) {
  return prose
    .replace(/\|/g, '，')
    .split(/[。！？!?\n]+/)
    .map(part => part.trim())
    .filter(part => part !== '')
}

/**
 * Chinese readability heuristic: average sentence length decides the base
 * level, an over-long handout drops one level because length itself tires a
 * reader. Thresholds are tuned for this template, not a general readability
 * formula.
 * @param {string} guide - rendered Markdown.
 * @returns {{ level: string, totalChars: number, sentenceCount: number, avgSentenceLength: number }}
 */
export function readability(guide) {
  const prose = guide
    .split('\n')
    .filter(line => !/^\s*\|?[\s|:-]+\|?\s*$/.test(line))
    .map(line => line.replace(/^#+\s*/, ''))
    .join('\n')
  const totalChars = charCount(prose)
  const sentenceCount = Math.max(1, sentencesOf(prose).length)
  const avgSentenceLength = Math.round(totalChars / sentenceCount)

  let index = avgSentenceLength <= 15 ? 0 : avgSentenceLength <= 25 ? 1 : 2
  if (totalChars > 1200 && index < READING_LEVELS.length - 1) index += 1

  return { level: READING_LEVELS[index], totalChars, sentenceCount, avgSentenceLength }
}

/**
 * Render an empty-list section body.
 * @param {string[]} items - doctor-written lines.
 * @param {string} absent - statement used when the list is empty.
 * @returns {string[]} body lines.
 */
function bullets(items, absent) {
  if (items.length === 0) return [absent]
  return items.map(item => `- ${item}`)
}

/**
 * Build the guide. The section order is fixed and identical for every input:
 * title, one-sentence diagnosis, medication table, diet & activity, follow-up,
 * when to seek urgent care.
 * @param {object} raw - tool arguments.
 * @returns {{ ok: true, guide_markdown: string, reading_level: string } | { ok: false, error: string }}
 */
export function generateGuide(raw) {
  const normalized = normalizeGuideInput(raw)
  if (!normalized.ok) return normalized
  const { diagnosis, medications, restrictions, followup, warningSigns } = normalized.value

  const lines = [
    '# 您的就诊须知',
    '',
    `## ${SECTION_TITLES[0]}`,
    `本次诊断：${sentence(diagnosis)}`,
    '',
    `## ${SECTION_TITLES[1]}`,
  ]

  if (medications.length === 0) {
    lines.push(ABSENT.medications)
  } else {
    lines.push('| 药名 | 怎么吃 | 吃多久 | 注意事项 |', '| --- | --- | --- | --- |')
    for (const medication of medications) {
      const how = [medication.dosage, medication.frequency].filter(part => part !== '').join('，') || EMPTY
      lines.push(`| ${cell(medication.name)} | ${cell(how)} | ${cell(medication.duration || EMPTY)} | ${cell(medication.note || EMPTY)} |`)
    }
  }

  lines.push(
    '',
    `## ${SECTION_TITLES[2]}`,
    ...bullets(restrictions, ABSENT.restrictions),
    '',
    `## ${SECTION_TITLES[3]}`,
    followup === '' ? ABSENT.followup : followup,
    '',
    `## ${SECTION_TITLES[4]}`,
    ...bullets(warningSigns, ABSENT.warningSigns),
    '',
  )

  const guide = lines.join('\n')
  const measured = readability(guide)
  return { ok: true, guide_markdown: guide, reading_level: measured.level }
}
