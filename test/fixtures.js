/**
 * The three required validation inputs: an upper-respiratory cold, a
 * hypertension follow-up, and a post-operative check. Kept in one place so the
 * core and host suites exercise exactly the same doctor decisions.
 */
export const CASES = {
  cold: {
    diagnosis: '上呼吸道感染（普通感冒）',
    medications: [
      { name: '布洛芬缓释胶囊', dosage: '每次 1 粒', frequency: '一日两次', duration: '3 天', note: '饭后服用' },
      { name: '氯雷他定片', dosage: '每次 1 片', frequency: '每晚一次', duration: '5 天' },
    ],
    restrictions: ['多喝温水', '避免饮酒', '保证睡眠'],
    followup: '症状超过 5 天未缓解，请到门诊复查。',
    warning_signs: ['持续高热超过 3 天', '呼吸急促或胸闷', '意识模糊'],
  },
  hypertension: {
    diagnosis: '原发性高血压 2 级（中危）',
    medications: [
      { name: '苯磺酸氨氯地平片', dosage: '每次 5 mg', frequency: '每日一次', duration: '长期服用', note: '每天固定时间服用，不要自行停药' },
    ],
    restrictions: ['每日食盐不超过 5 g', '避免剧烈情绪波动', '每周至少 5 天中等强度运动，每次 30 分钟'],
    followup: '2 周后到高血压门诊复查，带家庭血压记录。',
    warning_signs: ['血压超过 180/110 mmHg', '剧烈头痛伴呕吐', '胸痛或一侧肢体无力'],
  },
  surgery: {
    diagnosis: '腹腔镜胆囊切除术后第 3 天',
    medications: [
      { name: '头孢呋辛酯片', dosage: '每次 0.25 g', frequency: '一日两次', duration: '5 天', note: '饭后服用，服完为止' },
    ],
    restrictions: ['术后 2 周内避免提重物超过 5 kg', '伤口保持干燥，淋浴时用防水贴覆盖', '饮食从清淡半流质逐步过渡'],
    followup: '术后 7 天到外科门诊拆线复查。',
    warning_signs: ['伤口红肿、渗液或发热超过 38.5℃', '持续腹痛或呕吐', '皮肤或眼白发黄'],
  },
}

/** Every string the caller supplied, in the order the guide uses it. */
export function inputFragments(input) {
  const fragments = [input.diagnosis, input.followup ?? '']
  for (const medication of input.medications ?? []) {
    for (const value of Object.values(medication)) fragments.push(value)
  }
  fragments.push(...(input.restrictions ?? []), ...(input.warning_signs ?? []))
  return fragments.filter(value => value !== '')
}
