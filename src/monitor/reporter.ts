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
import { REPORT_TOOL_NAME } from '../constants'
import type { ProcessCollector } from './collector'
import type { ProcessHandle, ReportReceipt } from './types'

/** 校验单个句柄,返回错误原因(合法时为 null) */
function validateHandle(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return '句柄必须是对象'
  const item = raw as Record<string, unknown>
  if (!Number.isInteger(item.pid) || (item.pid as number) <= 0) return '进程标识必须为正整数'
  if (item.name !== undefined && typeof item.name !== 'string') return '可读名称必须为字符串'
  if (item.parentPid !== undefined && (!Number.isInteger(item.parentPid) || (item.parentPid as number) <= 0)) {
    return '父进程标识必须为正整数'
  }
  if (item.sessionId !== undefined && (typeof item.sessionId !== 'string' || item.sessionId.length === 0)) {
    return '会话标识必须为非空字符串'
  }
  return null
}

/** 注册进程句柄汇报工具 */
export function registerReporter(ctx: Context, collector: ProcessCollector): void {
  ctx.tools.register(defineTool({
    name: REPORT_TOOL_NAME,
    description: '向系统监控插件汇报无法自主识别的进程句柄',
    parameters: {
      handles: {
        type: 'array',
        required: true,
        description: '进程句柄列表',
        items: {
          type: 'object',
          properties: {
            pid: { type: 'number', required: true, description: '进程标识' },
            name: { type: 'string', description: '进程可读名称' },
            parentPid: { type: 'number', description: '父进程标识' },
            sessionId: { type: 'string', description: '所属会话标识(用于面板按会话分组)' },
          },
          additionalProperties: false,
        },
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const list = Array.isArray(args.handles) ? (args.handles as unknown[]) : []
      const rejected: ReportReceipt['rejected'] = []
      const accepted: ProcessHandle[] = []
      const seen = new Set<number>()
      for (const raw of list) {
        const reason = validateHandle(raw)
        if (reason) {
          const pid = (raw as Record<string, unknown> | null)?.pid
          rejected.push({ pid: typeof pid === 'number' ? pid : NaN, reason })
          continue
        }
        const handle = raw as ProcessHandle
        // 重复句柄按合并处理,不重复统计
        if (seen.has(handle.pid)) continue
        seen.add(handle.pid)
        accepted.push(handle)
      }
      collector.mergeReported(accepted)
      const detail = rejected.length > 0 ? `;拒绝 ${rejected.length} 项` : ''
      const receipt: ReportReceipt = {
        accepted: accepted.length,
        rejected,
        message: `已纳入监控 ${accepted.length} 个进程${detail}`,
      }
      return JSON.stringify(receipt)
    },
  }))
}