/** 标签净化：过滤非算法能力维度的噪声标签（移植自原 icpc-workbench） */

const CF_NOISE_PREFIX = '*'

const CONTEST_SOURCE_KEYWORDS = [
  '蓝桥杯', 'NOIP', 'NOI', '省选', '联赛', '洛谷', 'Codeforces', 'AtCoder',
  'ABC', 'ARC', 'AGC', '牛客', 'GESP', 'USACO', 'IOI', 'ICPC', 'COCI', 'POI',
  'NERC', 'CERC', 'eJOI', 'Code+', '夏令营', '导刊', '青少年', '信息与未来',
]

const REGION_TAGS = new Set([
  '北京', '天津', '安徽', '江苏', '湖南', '福建', '浙江', '上海', '广东',
  '四川', '重庆', '河北', '河南', '山东', '陕西', '湖北',
])

const MISC_NOISE_TAGS = new Set([
  'O2优化', 'Special Judge', 'SPJ', '提交答案', '提答', '模板题', '入门',
])

function isYearTag(tag: string): boolean {
  return /^(19|20)\d{2}$/.test(tag)
}

function isContestSourceTag(tag: string): boolean {
  return CONTEST_SOURCE_KEYWORDS.some((k) => tag.includes(k))
}

export function isNoiseTag(tag: string): boolean {
  const t = tag.trim()
  if (t === '') return true
  if (t.startsWith(CF_NOISE_PREFIX)) return true
  if (isYearTag(t)) return true
  if (isContestSourceTag(t)) return true
  if (REGION_TAGS.has(t)) return true
  if (MISC_NOISE_TAGS.has(t)) return true
  return false
}

export function filterNoiseTags(tags: string[]): string[] {
  return tags.filter((t) => !isNoiseTag(t))
}
