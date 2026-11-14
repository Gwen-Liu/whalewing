import { registerBuiltin } from '../../src/features.js';
import { applyManagement } from './management.js';
import { applyHandoff } from './handoff.js';
import { applyExpertEdit } from './expert-edit.js';
import { applyDispatch } from './dispatch.js';
import { applyExpertSchedule } from './expert-schedule.js';
export const inject = ['whalewing'];
/** 管理依赖晚到只影响助手管理能力，不阻塞工作台底座。 */
export function apply(ctx) { registerBuiltin(ctx, 'assistant'); applyManagement(ctx); applyHandoff(ctx); applyExpertEdit(ctx); applyDispatch(ctx); applyExpertSchedule(ctx); }
