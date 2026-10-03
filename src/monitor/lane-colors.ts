/*
 * 泳道配色(纯函数)
 *
 * 面板的泳道/堆叠条按语义分配颜色:主进程与宿主、子代理合计、其他应用、空闲各有固定语义色,
 * 其余成员(普通进程与会话)按顺序取「泳道预备颜色池」。
 * 预备颜色池由用户在配置中增删,数量不少于 `MIN_LANE_COLOR_POOL_SIZE`;
 * 成员数超过池容量时按取色方案处理:
 *   - `cycle`:循环复用池内颜色,绝不新增、不提醒;
 *   - `midpoint`:取相邻两色的中间色作为新预备色插入池中(被占用则按轮询取下一个中间色),
 *     新增色写回配置,下次取中间色从该新增色的下一个候选继续轮询。
 * 纯函数,不含 DOM 依赖,便于回归测试。
 * 作者:JularDepick
 */

/** 取色方案:`cycle` 循环复用,`midpoint` 自动取间色新增 */
export type LaneColorStrategy = 'cycle' | 'midpoint'

/** 取色结果:成员颜色序列、可能已增长的池、下一次取中间色的候选起点 */
export interface LaneColorPlan {
  /** 依次分配给普通成员的颜色(长度等于请求的成员数) */
  colors: string[]
  /** 取色后的池(策略为 midpoint 时可能已插入新色;cycle 时原样返回) */
  pool: string[]
  /** 下一次取中间色的候选起点(池内相邻对的索引) */
  cursor: number
}

/** 十六进制颜色(3 位或 6 位,可带 `#`)→ 归一化的 `#rrggbb` 小写;非法返回 null */
export function normalizeLaneColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim().toLowerCase()
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(raw)
  if (match === null) return null
  const body = match[1]
  const full = body.length === 3 ? body.split('').map((char) => char + char).join('') : body
  return `#${full}`
}

/**
 * 归一化泳道预备颜色池:逐项校验、去重、保底补足。
 * 合法项保留原有顺序;数量低于 `minimum` 时按默认池顺序补足(不重复);无法补足时返回默认池。
 */
export function normalizeLaneColorPool(
  value: unknown,
  fallback: readonly string[],
  minimum: number,
): string[] {
  const source = Array.isArray(value) ? value : []
  const pool: string[] = []
  for (const item of source) {
    const color = normalizeLaneColor(item)
    if (color !== null && !pool.includes(color)) pool.push(color)
  }
  if (pool.length >= minimum) return pool
  for (const item of fallback) {
    if (pool.length >= minimum) break
    const color = normalizeLaneColor(item)
    if (color !== null && !pool.includes(color)) pool.push(color)
  }
  return pool.length >= minimum ? pool : fallback.map((item) => normalizeLaneColor(item) ?? item)
}

/** 归一化取色方案:非法值回退默认方案 */
export function normalizeLaneColorStrategy(value: unknown, fallback: LaneColorStrategy): LaneColorStrategy {
  return value === 'cycle' || value === 'midpoint' ? value : fallback
}

/** 两色的中间色(按通道线性插值后四舍五入;非法输入回退第一个可解析色) */
export function mixLaneColors(a: string, b: string, ratio = 0.5): string {
  const first = normalizeLaneColor(a)
  const second = normalizeLaneColor(b)
  if (first === null && second === null) return '#000000'
  if (first === null) return second as string
  if (second === null) return first
  const channel = (offset: number): number => {
    const left = Number.parseInt(first.slice(1 + offset * 2, 3 + offset * 2), 16)
    const right = Number.parseInt(second.slice(1 + offset * 2, 3 + offset * 2), 16)
    return Math.max(0, Math.min(255, Math.round(left + (right - left) * ratio)))
  }
  const hex = [channel(0), channel(1), channel(2)].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `#${hex}`
}

/**
 * 相邻两色的中间色候选(含首尾环绕对,共池长度个候选)。
 * 候选顺序即轮询顺序,起点由 `cursor` 决定。
 */
export function midpointCandidates(pool: readonly string[]): string[] {
  if (pool.length < 2) return []
  return pool.map((color, index) => mixLaneColors(color, pool[(index + 1) % pool.length]))
}

/**
 * 选择预备色:
 * 池内成员直接取对应位置的颜色;池外成员按策略处理。
 * `midpoint` 在池外逐次插入中间色(被占用则轮询下一个候选),插入位置在成对的前一色之后,
 * 并把候选起点推进到新增色之后;所有候选都已被占用时退回循环复用,保证取色一定有结果。
 */
export function planLaneColors(
  count: number,
  pool: readonly string[],
  strategy: LaneColorStrategy,
  cursor = 0,
): LaneColorPlan {
  const colors: string[] = []
  const next = normalizeLaneColorPool(pool, pool, 2)
  let start = Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0
  if (next.length === 0) return { colors: new Array(Math.max(0, count)).fill('#94a3b8'), pool: [], cursor: 0 }
  const wanted = Math.max(0, Math.floor(count))
  for (let index = 0; index < wanted; index += 1) {
    if (index < next.length) {
      colors.push(next[index])
      continue
    }
    if (strategy === 'cycle') {
      colors.push(next[index % next.length])
      continue
    }
    const candidates = midpointCandidates(next)
    let inserted = false
    for (let step = 0; step < candidates.length; step += 1) {
      const at = (start + step) % candidates.length
      const color = candidates[at]
      if (next.includes(color)) continue
      next.splice(at + 1, 0, color)
      colors.push(color)
      start = at + 1
      inserted = true
      break
    }
    if (!inserted) colors.push(next[index % next.length])
  }
  return { colors, pool: next, cursor: start }
}
