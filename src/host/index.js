/**
 * Host half of dsh-patient-education.
 *
 * Registers one tool, `generate_patient_guide`, which takes the decisions a
 * doctor has already made and returns the same decisions rewritten for the
 * patient. It never asks a model to phrase anything: `src/core/guide.js` fills a
 * hard-coded template with the caller's own words.
 *
 * @module dsh-patient-education
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { READING_LEVELS, generateGuide } from '../core/guide.js'

/** Plugin id used by the loader entry and diagnostics. */
export const name = 'patient-education'

/** Only the tool registry is needed. */
export const inject = ['tools']

/** Output contract; the core returns exactly these two fields. */
export const GUIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    guide_markdown: { type: 'string', description: '给患者的 Markdown 须知，章节顺序固定' },
    reading_level: { type: 'string', enum: READING_LEVELS, description: '按平均句长（并参考总字数）的启发式可读性等级' },
  },
}

/**
 * Register the host plugin.
 * @param {*} ctx - host plugin context.
 */
export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'generate_patient_guide',
    description: [
      'Format a decision the doctor has already made into a patient-readable after-visit guide (您的就诊须知): one-sentence diagnosis, medication table (药名 / 怎么吃 / 吃多久 / 注意事项), diet & activity, follow-up, and when to seek urgent care.',
      'Template-filled, not generated: every patient-facing sentence is a fixed template slot filled with the input verbatim; nothing the doctor did not write may appear, and no medical advice, diagnosis or medication recommendation is added.',
      'Pass only what the doctor decided. The doctor must review the output before handing it to a patient.',
    ].join(' '),
    parameters: {
      diagnosis: {
        type: 'string',
        required: true,
        description: '医生已确定的诊断，一句话，≤200 字，原样写入须知',
      },
      medications: {
        type: 'array',
        description: '医生已开具的用药，最多 20 条；不填表示本次无用药。note 可写医生交代的注意事项',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true, description: '药名，≤80 字' },
            dosage: { type: 'string', description: '单次剂量，例如「每次 1 片」，≤80 字' },
            frequency: { type: 'string', description: '服用频次，例如「一日三次」，≤80 字' },
            duration: { type: 'string', description: '服用时长，例如「3 天」，≤80 字' },
            note: { type: 'string', description: '医生交代的注意事项，例如「饭后服用」，≤160 字；不填则表格显示 —' },
          },
        },
      },
      restrictions: {
        type: 'array',
        description: '医生交代的饮食与活动限制，每条 ≤200 字，最多 20 条',
        items: { type: 'string' },
      },
      followup: {
        type: 'string',
        description: '医生交代的复诊安排，≤300 字',
      },
      warning_signs: {
        type: 'array',
        description: '医生列出的需要立即就医的情况，每条 ≤200 字，最多 20 条',
        items: { type: 'string' },
      },
    },
    output: {
      schema: GUIDE_SCHEMA,
      render(_args, value) {
        return [{ type: 'text', text: value.guide_markdown }]
      },
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: 'Patient guide',
        kind: 'other',
        rawInput: {
          diagnosis: args?.diagnosis,
          medications: Array.isArray(args?.medications) ? args.medications.length : 0,
          warning_signs: Array.isArray(args?.warning_signs) ? args.warning_signs.length : 0,
        },
      }
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const result = generateGuide(args ?? {})
      if (!result.ok) throw new Error(result.error)
      return { guide_markdown: result.guide_markdown, reading_level: result.reading_level }
    },
  }))
}
