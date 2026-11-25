/*
 * 进程句柄汇报工具
 *
 * 提供工具给 Agent 主动汇报插件无法自主识别的进程句柄
 * (如 subagent 进程):校验、去重并并入采样集合,
 * 回执格式遵循 docs/v0.1.0-进程汇报机制与规范.md。
 * 作者:JularDepick
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { MAX_HANDLE_NAME_LENGTH, MAX_HANDLE_SESSION_ID_LENGTH, MAX_REPORTED_HANDLES, REPORT_TOOL_NAME } from '../constants'
import { callerSessionId } from './attribution'
import type { ProcessCollector } from './collector'
import type { ProcessHandle, ReportReceipt } from './types'

/** 校验单个句柄,返回错误原因(合法时为 null) */
function validateHandle(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return '句柄必须是对象'
  const item = raw as Record<string, unknown>
  if (!Number.isInteger(item.pid) || (item.pid as number) <= 0) return '进程标识必须为正整数'
  if (item.name !== undefined && typeof item.name !== 'string') return '可读名称必须为字符串'
  if (typeof item.name === 'string' && item.name.length > MAX_HANDLE_NAME_LENGTH) {
    return `可读名称不得超过 ${MAX_HANDLE_NAME_LENGTH} 个字符`
  }
  if (item.parentPid !== undefined && (!Number.isInteger(item.parentPid) || (item.parentPid as number) <= 0)) {
    return '父进程标识必须为正整数'
  }
  if (item.sessionId !== undefined && (typeof item.sessionId !== 'string' || item.sessionId.length === 0)) {
    return '会话标识必须为非空字符串'
  }
  if (typeof item.sessionId === 'string' && item.sessionId.length > MAX_HANDLE_SESSION_ID_LENGTH) {
    return `会话标识不得超过 ${MAX_HANDLE_SESSION_ID_LENGTH} 个字符`
  }
  return null
}

/** 注册进程句柄汇报工具(经 ctx.effect 纳入插件生命周期,卸载时自动注销) */
export function registerReporter(ctx: Context, collector: ProcessCollector): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: REPORT_TOOL_NAME,
    description: '向系统监控插件汇报无法自主识别的进程句柄',
    parameters: {
      handles: {
        type: 'array',
        required: true,
        description: '进程句柄列表',
        items: {
          type: 'object',
          /*
           * 字段一律声明为无约束 JSON:框架会先用本 schema 校验入参,
           * 声明成 number/string 时一个句柄的类型偏差就让整批 INVALID_ARGS,
           * 逐条校验的 rejected 回执与同批合法句柄一起丢失;
           * 类型与取值判定由 validateHandle 承担,多余字段忽略(additionalProperties 放开)
           */
          properties: {
            pid: { type: 'json', required: true, description: '进程标识(正整数)' },
            name: { type: 'json', description: '进程可读名称(字符串)' },
            parentPid: { type: 'json', description: '父进程标识(正整数,可选)' },
            sessionId: { type: 'json', description: '所属会话标识(非空字符串,缺省取发起本次调用的会话)' },
          },
          additionalProperties: true,
        },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const incoming = Array.isArray(args.handles) ? (args.handles as unknown[]) : []
      const fallbackSession = callerSessionId(exec)
      /*
       * 溢出条数不折成一条伪拒绝项(那会让「拒绝 1 项」与真实丢弃条数不符),
       * 改为在文案里给出真实条数;rejected 只承载逐条校验失败项
       */
      const rejected: ReportReceipt['rejected'] = []
      const accepted: ProcessHandle[] = []
      const seen = new Set<number>()
      const rejectedPids = new Set<number>()
      for (const raw of incoming) {
        const reason = validateHandle(raw)
        if (reason) {
          const pid = (raw as Record<string, unknown> | null)?.pid
          // 无法解析的 pid 记 0(JSON 无法表示 NaN,序列化后会变成 null)
          const numericPid = typeof pid === 'number' && Number.isFinite(pid) ? pid : 0
          // 同一 pid 的重复非法项只记一条,避免拒绝计数被重复项放大
          if (numericPid > 0) {
            if (rejectedPids.has(numericPid)) continue
            rejectedPids.add(numericPid)
          }
          rejected.push({ pid: numericPid, reason })
          continue
        }
        const handle = raw as ProcessHandle
        /*
         * 去重放在逐条校验之后:先按 pid 去重时,同 pid 若先出现一条非法项,
         * 后面那条合法项会被当成重复项直接丢弃(既不纳入监控,也不产生自己的拒绝原因)
         */
        if (seen.has(handle.pid)) continue
        seen.add(handle.pid)
        // 未显式标注会话时按调用方会话归属(模型只报 pid 也能落进正确的会话维度)
        accepted.push(handle.sessionId === undefined && fallbackSession !== undefined
          ? { ...handle, sessionId: fallbackSession }
          : handle)
      }
      // 条数上限按接受项截断:重复与非法项都不占名额
      const list = accepted.slice(0, MAX_REPORTED_HANDLES)
      const overflow = accepted.length - list.length
      collector.mergeReported(list)
      const detail = rejected.length > 0 ? `;拒绝 ${rejected.length} 项` : ''
      const overflowDetail = overflow > 0 ? `;另有 ${overflow} 条超出单次上限 ${MAX_REPORTED_HANDLES} 条未纳入` : ''
      const receipt: ReportReceipt = {
        accepted: accepted.length,
        rejected,
        message: `已纳入监控 ${accepted.length} 个进程${detail}${overflowDetail}`,
      }
      return JSON.stringify(receipt)
    },
  })))
}