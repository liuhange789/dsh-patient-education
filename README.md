# dsh-patient-education

**医生说完就忘？把医嘱变成患者看得懂的须知，30 秒生成。**

A DSH plugin for the last-minute-of-the-consultation problem: the doctor has already decided what to do, but the patient leaves with three sentences in their head and none of them survive the elevator. `generate_patient_guide` takes the decisions the doctor has already made and rewrites them into a one-page after-visit guide the patient can actually read: one-sentence diagnosis, a medication table, diet & activity, follow-up, and the warning signs that mean "come back now".

It is deliberately **not** a medical assistant. The plugin has no model-generated medical wording, no knowledge base, no triage logic. It fills a fixed template with the doctor's own words.

## Three boundaries (read this first)

1. **The plugin only formats a decision the doctor has already made.** Every patient-facing sentence is a hard-coded template slot; the text inside the slot is the caller's input, copied verbatim (whitespace collapsed, table pipes escaped). It does not interpret the diagnosis, expand an abbreviation, or infer what the doctor "probably meant".
2. **The plugin provides no medical advice, no diagnosis and no medication recommendation.** It never adds a drug, a dose, a diet rule, a warning sign or a follow-up interval. Fields the doctor left empty are printed as explicit absence lines (`医生本次未填写用药。`), not filled with a default.
3. **A doctor must review the output before it is handed to a patient.** The guide is a formatting layer, not a second opinion. Handing the raw output to a patient without review is a use of this plugin outside its scope.

If the doctor's decision is wrong, incomplete, or not yet made, this plugin will faithfully reproduce that — it is the wrong tool for that moment.

## Install

```bash
npm install @liuhange/dsh-patient-education
```

Add the bundle to a DSH profile's `package.json` (alongside the base bundles) and run `npm install` in the profile:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-headless",
        "@liuhange/dsh-patient-education"
      ]
    }
  },
  "dependencies": {
    "@liuhange/dsh-patient-education": "0.1.0"
  }
}
```

The plugin registers one host tool. There is no browser half: the guide is plain Markdown and the shell renders it as text.

## Tool

| Tool | What it does |
| --- | --- |
| `generate_patient_guide` | Fill the after-visit template from the doctor's input and return `guide_markdown` + `reading_level`. |

Input:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `diagnosis` | string | yes | One sentence, ≤200 characters. Written as `本次诊断：…。` |
| `medications` | array | no | ≤20 items; empty means "no medication this visit". |
| `medications[].name` | string | yes | Drug name, ≤80 characters. |
| `medications[].dosage` | string | no | e.g. `每次 1 片`, ≤80 characters. |
| `medications[].frequency` | string | no | e.g. `一日两次`, ≤80 characters. |
| `medications[].duration` | string | no | e.g. `3 天`, ≤80 characters. |
| `medications[].note` | string | no | The doctor's own precaution, e.g. `饭后服用`, ≤160 characters. Shown in the 注意事项 column; absent → `—`. |
| `restrictions` | string[] | no | Diet & activity lines the doctor stated, ≤200 characters each, ≤20 items. |
| `followup` | string | no | Follow-up arrangement, ≤300 characters. |
| `warning_signs` | string[] | no | "Seek urgent care now" conditions as stated by the doctor, ≤200 characters each, ≤20 items. |

Output:

- `guide_markdown` — the guide, section order fixed: `# 您的就诊须知` → 诊断 → 用药（药名 / 怎么吃 / 吃多久 / 注意事项）→ 饮食与活动 → 复查 → 什么情况需要立即就医.
- `reading_level` — `浅显` / `适中` / `偏难`, a Chinese heuristic over the rendered text: average sentence length (characters excluding punctuation and whitespace) decides the base level (`≤15` 浅显, `≤25` 适中, otherwise 偏难); a guide longer than 1200 characters drops one level, because length itself tires a reader. It is a template sanity check, not a validated readability instrument.

Validation happens before a single character is rendered:

- Unknown top-level fields and unknown medication fields are rejected, not ignored — silently dropping a field would let the caller believe a statement reached the patient.
- Empty strings, non-string values, oversized fields and oversized lists are rejected with the exact field name.
- Newlines are folded into spaces, so a pasted block cannot break the medication table or smuggle in an extra section.
- `|` is escaped inside table cells.

## Example

```javascript
generate_patient_guide({
  diagnosis: '上呼吸道感染（普通感冒）',
  medications: [
    { name: '布洛芬缓释胶囊', dosage: '每次 1 粒', frequency: '一日两次', duration: '3 天', note: '饭后服用' },
    { name: '氯雷他定片', dosage: '每次 1 片', frequency: '每晚一次', duration: '5 天' },
  ],
  restrictions: ['多喝温水', '避免饮酒', '保证睡眠'],
  followup: '症状超过 5 天未缓解，请到门诊复查。',
  warning_signs: ['持续高热超过 3 天', '呼吸急促或胸闷', '意识模糊'],
})
```

```markdown
# 您的就诊须知

## 诊断
本次诊断：上呼吸道感染（普通感冒）。

## 用药
| 药名 | 怎么吃 | 吃多久 | 注意事项 |
| --- | --- | --- | --- |
| 布洛芬缓释胶囊 | 每次 1 粒，一日两次 | 3 天 | 饭后服用 |
| 氯雷他定片 | 每次 1 片，每晚一次 | 5 天 | — |

## 饮食与活动
- 多喝温水
- 避免饮酒
- 保证睡眠

## 复查
症状超过 5 天未缓解，请到门诊复查。

## 什么情况需要立即就医
- 持续高热超过 3 天
- 呼吸急促或胸闷
- 意识模糊
```

Every line above is either a template line or the doctor's input, character for character.

## Development

```bash
npm test    # builds lib/ and runs node:test core + host suites
npm run build
```

The host suite loads the built `lib/index.js` the way the loader does, registers the tool through a real `ctx`, and executes the cold / hypertension / post-operative cases. The core suite proves, line by line, that no output line exists outside the template plus the input.

## License

MIT
