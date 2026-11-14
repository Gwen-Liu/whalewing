import { expertActivity, rosterOf, sortInUse, defaultIdleDays } from './roster.js';

/** 工作台外入口与所属功能共用上下文，停用时一起释放。 */
export function registerEntries(ctx, kit, api) {
  const { React, Avatar, useClosedPopover, css, formatFileMention } = kit;
  const { createElement: h, useState, useRef, useEffect, useSyncExternalStore } = React;
  const NS = 'whalewing', t = ctx.locale.bind(NS);
  function ExpertPicker({ api, sessionId, useProjection, useSessions, t }) {
    const projection = useProjection('whalewingExpert');
    const choices = useSyncExternalStore(api.subscribeChoices, api.choices, api.choices);
    const choice = sessionId ? choices.sessions[sessionId] : choices.staged;
    const selected = choice && (!sessionId || choice.preview) ? choice.expertId : projection?.expertId ?? null;
    const preset = useSessions((state) => state.byId[sessionId]?.projectionValues?.agentPreset);
    const registry = useSyncExternalStore(api.subscribeExperts, api.experts, api.experts);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [more, setMore] = useState(false);
    const sessions = useSyncExternalStore(api.subscribeSessions, api.sessionsSnapshot, api.sessionsSnapshot);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const trigger = useRef(null);
    const panel = useRef(null);
    const pending = useRef(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; api.loadExperts().catch(reason => { if (mounted.current) setError(reason.message); }); return () => { mounted.current = false; }; }, []);
    const close = () => { panel.current?.hidePopover(); setOpen(false); trigger.current?.focus(); };
    // 按 Esc、点别处时浏览器自己收起浮层，这里跟着记成已关，下次点一下就能打开。
    useClosedPopover(panel, () => setOpen(false));
    useEffect(() => {
      if (!open || !panel.current) return;
      const element = panel.current;
      const place = () => {
        const rect = trigger.current.getBoundingClientRect();
        // 按浮层实际量到的宽高放，不假设宽 340、高 420。
        element.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - element.offsetWidth - 12))}px`;
        element.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - element.offsetHeight - 12))}px`;
      };
      element.showPopover(); place(); element.querySelector('input')?.focus();
      window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
      return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); if (element.matches(':popover-open')) element.hidePopover(); };
    }, [open]);
    const roles = registry.experts;
    const historical = [...roles, ...registry.deleted].find(role => preset === `whalewing-${role.id}`);
    const current = roles.find(role => role.id === selected);
    if (historical) return h('span', { className: 'ww-expert-picker' }, t('historicalExpert', { name: historical.name }));
    // 2026-11-08 第三版：小鲸在最上面，其次在用的专家，其余收进“更多专家”；输入名字时全部一起找。
    const now = Date.now();
    const team = sortInUse(rosterOf({ experts: roles, activity: expertActivity(sessions, { archived: api.archivedSessions?.() ?? [], now }), marks: registry.roster?.marks, idleDays: registry.roster?.idleDays ?? defaultIdleDays, now })).map(entry => entry.role);
    const teamIds = new Set(team.map(role => role.id));
    const rest = roles.filter(role => role.id !== 'manager' && !teamIds.has(role.id));
    const keyword = query.trim().toLowerCase();
    const matches = roles.filter(role => `${role.name} ${role.description}`.toLowerCase().includes(keyword));
    const change = async (id) => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError('');
      try {
        await api.selectExpert(sessionId, id || null);
        if (mounted.current) { close(); setQuery(''); }
      } catch (reason) { if (mounted.current) { setError(reason.message || t('requestFailed')); api.notifySessionIssue(reason, () => change(id)); } }
      finally { pending.current = false; if (mounted.current) setBusy(false); }
    };
    const option = role => h('button', { type: 'button', key: role.id, disabled: busy, 'aria-pressed': selected === role.id, onClick: () => change(role.id) }, h(Avatar, { expert: role, size: 36 }), h('span', null, h('strong', null, role.name), h('small', null, role.description)));
    return h('div', { className: 'ww-expert-picker' }, h('style', null, css),
      h('button', { type: 'button', ref: trigger, className: 'ww-picker-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': open, onClick: () => setOpen(!open) }, current && h(Avatar, { expert: current, size: 20 }), current?.name || selected || t('expert'), h('span', { 'aria-hidden': true }, '⌄')),
      h('div', { ref: panel, popover: 'auto', className: 'ww-picker-popover', role: 'dialog', 'aria-label': t('expert'), onKeyDown: event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          const items = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
          const index = items.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          event.preventDefault(); items[next]?.focus();
        }
      } }, h('input', { 'aria-label': t('expertSearch'), placeholder: t('expertSearch'), value: query, onChange: event => setQuery(event.target.value) }),
      h('div', { className: 'ww-picker-options' }, h('button', { type: 'button', disabled: busy, onClick: () => change(null) }, t('noExpert')),
        ...(keyword ? matches.map(option) : [
          ...roles.filter(role => role.id === 'manager').map(option),
          team.length > 0 && h('p', { key: 'team', className: 'ww-picker-group' }, t('pickerInUse')),
          ...team.map(option),
          rest.length > 0 && h('button', { type: 'button', key: 'more', className: 'ww-picker-more', 'aria-expanded': more, onClick: () => setMore(!more) }, h('span', null, t(more ? 'pickerLess' : 'pickerMore', { count: rest.length }))),
          ...(more ? rest.map(option) : []),
        ]), !matches.length && h('p', null, t('noExpertMatch'))),
      busy && h('span', { role: 'status' }, t('loading')), error && h('p', { role: 'alert', className: 'ww-error' }, error)));
  }

  api.bindExpertLifecycle(ctx);
      // 新会话首页的专家入口来自鲸翼适配；原生 DSH 没有这个位置时，专家选择放到输入框左侧，会话标题栏不再重复显示。
      let heroSeat = false;
      const heroListeners = new Set();
      const subscribeHero = listener => { heroListeners.add(listener); return () => heroListeners.delete(listener); };
      const heroSnapshot = () => heroSeat;
      const setHeroSeat = value => { heroSeat = value; for (const listener of heroListeners) listener(); };
      function HeaderExpertPicker(props) { return useSyncExternalStore(subscribeHero, heroSnapshot, heroSnapshot) ? h(ExpertPicker, props) : null; }
      function InputExpertPicker(props) { return useSyncExternalStore(subscribeHero, heroSnapshot, heroSnapshot) ? null : h(ExpertPicker, props); }
      ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'whalewing-expert', order: -9, locale: NS, inject: () => ({ api }) }, HeaderExpertPicker));
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'whalewing-expert-picker', order: 10, locale: NS, inject: () => ({ api }) }, InputExpertPicker));
      ctx.slots.inject('conversation.hero.actions', () => {
        setHeroSeat(true);
        const dispose = ctx.slots.register({ name: 'conversation.hero.actions', id: 'whalewing-expert', order: 10, locale: NS, inject: () => ({ api }) }, ExpertPicker);
        return () => { setHeroSeat(false); dispose(); };
      });
  // 专家团队页中间一栏嵌的专家任务会话：和小鲸面板同一种原生对话，正文、输入、审批都由 DSH 负责。
  function ExpertConversation({ useSession, renderFactorySlot, views }) {
    const session = useSession(value => value);
    return renderFactorySlot('conversation.content', { variant: 'embedded', phase: session.openState === 'loading' ? 'settling' : 'active', hero: false }, { slots: { views } });
  }
  function ExpertChat({ renderSlot }) { return h('div', { className: 'ww-assistant-chat' }, renderSlot('conversation.session', { view: 'chat' })); }
  ctx.slots.inject('whalewing.experts.conversation', () => ctx.slots.register({ name: 'whalewing.experts.conversation', inject: () => ({ views: ExpertChat }) }, ExpertConversation));
}
