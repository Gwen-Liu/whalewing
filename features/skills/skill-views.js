import { isSkillIdentifier } from './contract.js';
import { skillTitle } from '../../src/skill-titles.js';

// 技能中心页里“技能”这一类：我的（个人、共用、团队、插件包、内置、各项目）和发现（skills.sh）。页面外壳在 client.js。
const marketPage = id => `https://skills.sh/${id.split('/').map(encodeURIComponent).join('/')}`;
export const installsText = count => count >= 10000 ? `${(count / 10000).toFixed(count >= 1000000 ? 0 : 1).replace(/\.0$/, '')} 万次安装` : `${count} 次安装`;
const initial = name => [...String(name || '?').replace(/^whalewing-/, '')][0]?.toUpperCase() || '?';
// 随包技能（内置、改过的内置）在界面上用中文名，英文短名放在类别后面，专家和 DSH 仍按英文短名加载。
const titled = item => item.origin === 'builtin' || item.origin === 'override';
const titleOf = item => titled(item) ? skillTitle(item.name) : item.name;

export function createSkillViews(kit, { labelText }) {
  const { React, ConfirmDialog, useDiscard, Drawer, Glyph } = kit;
  const { createElement: h, useState, useRef, useEffect } = React;

  function SkillEditor({ api, entry, t, onClose, onSaved, notify }) {
    const [name, setName] = useState('');
    const [content, setContent] = useState(entry?.content ?? '---\nname: my-skill\ndescription: 描述适用场景与完成目标\n---\n\n# 操作步骤\n\n');
    const [busy, setBusy] = useState(false);
    const setError = message => { if (message) notify(message, { kind: 'error' }); };
    const [unverified, setUnverified] = useState(false);
    const current = useRef(entry);
    const createdId = useRef(null);
    const saving = useRef(false);
    const modal = useRef(null);
    const lifetime = useRef(null);
    // 打开（或载入已保存版本）时的正文；之后有改动、或新建时填了标识，关闭前先确认放弃。
    const [baseline, setBaseline] = useState(content);
    const [requestClose, discard] = useDiscard({ dirty: content !== baseline || Boolean(name.trim()), onClose, busy });
    useEffect(() => {
      lifetime.current = new AbortController();
      const previous = typeof document === 'undefined' ? null : document.activeElement;
      modal.current?.showModal();
      return () => { lifetime.current.abort(); modal.current?.close(); previous?.focus(); };
    }, []);
    const readSaved = async () => {
      const signal = lifetime.current?.signal;
      const value = await api.skillRequest({ action: 'read', id: current.current?.id || createdId.current }, signal);
      // 原件编辑首次落为覆盖，未知回执只能消费 owner 返回的覆盖身份，不能拼目录。
      return api.resolveSkillEdit(value.entry, signal);
    };
    const load = async () => {
      setBusy(true); setError('');
      try { const actual = await readSaved(); lifetime.current?.signal.throwIfAborted(); if (actual) { current.current = actual; setContent(actual.content); setBaseline(actual.content); } setUnverified(false); }
      catch (reason) { setError(reason.message); }
      finally { setBusy(false); }
    };
    const save = async () => {
      if (saving.current || unverified) return;
      if (!current.current && !createdId.current) {
        // 标识不合规就不发请求，说明规则；标识框照常可改。
        const identifier = name.trim();
        if (!identifier) { setError(t('skillIdentifierHelp')); return; }
        if (!isSkillIdentifier(identifier)) { setError(t('skillIdentifierRule')); return; }
        // 发出新建前固定身份：宿主可能已经写入但回读没成功，重试或载入都只认这个标识，不另建一份。
        createdId.current = `${identifier}/SKILL.md`;
      }
      const before = current.current;
      let accepted;
      saving.current = true; setBusy(true); setError('');
      try {
        const input = before ? { action: 'update', id: before.id, content, expectedHash: before.hash, ...(before.baseHash === undefined ? {} : { expectedBaseHash: before.baseHash }) } : { action: 'create', id: createdId.current, content, expectedHash: '' };
        const saved = await api.skillRequest(input, lifetime.current?.signal);
        if (!saved.entry) throw new Error(t('skillReadback'));
        accepted = saved.entry;
        current.current = saved.entry;
        const actual = await readSaved();
        if (!actual || actual.hash !== saved.entry.hash || actual.content !== saved.entry.content) throw new Error(t('skillReadback'));
        lifetime.current?.signal.throwIfAborted();
        await onSaved(actual);
      } catch (reason) {
        if (lifetime.current?.signal.aborted) return;
        try {
          const actual = await readSaved();
          if (accepted && actual?.hash === accepted.hash && actual.content === accepted.content) { current.current = actual; await onSaved(actual); return; }
          // 新建被宿主明确拒绝、这个标识下也确实没有文件：没写入，放开标识让员工改；拿不准时保持固定，避免重复新建。
          if (!before && !accepted && reason.answered && actual === null) createdId.current = null;
          // 已有不同版本保留草稿，只有员工明确载入后才采用新的写前哈希。
          setUnverified(Boolean(actual && (actual.id !== before?.id || actual.hash !== before?.hash)));
        } catch { setUnverified(true); }
        setError(reason.message);
      } finally { saving.current = false; if (!lifetime.current?.signal.aborted) setBusy(false); }
    };
    return h(React.Fragment, null, h('dialog', { ref: modal, className: 'ww-editor ww-page', 'aria-label': t(entry ? 'editSkill' : 'newSkill'), onCancel: event => { event.preventDefault(); requestClose(); }, onClick: event => { if (event.target === event.currentTarget) requestClose(); } },
      h('header', { className: 'ww-header' }, h('h2', null, t(entry ? 'editSkill' : 'newSkill')), h('button', { type: 'button', disabled: busy, onClick: requestClose, 'aria-label': t('close') }, '×')),
      h('div', { className: 'ww-editor-body' }, !entry && h('label', null, t('skillIdentifier'), h('input', { value: name, disabled: busy || Boolean(createdId.current), onChange: event => setName(event.target.value), placeholder: 'my-skill' }), h('small', null, t('skillIdentifierHelp'))), entry?.origin === 'builtin' && h('p', { className: 'ww-notice' }, t('skillBuiltinHelp')), h('label', null, t('skillContent'), h('textarea', { value: content, disabled: busy, onChange: event => setContent(event.target.value), spellCheck: false })), unverified && h('p', { className: 'ww-notice' }, t('skillReadback'), h('button', { type: 'button', onClick: load, disabled: busy }, t('skillLoadSaved')))),
      h('footer', { className: 'ww-row' }, h('button', { type: 'button', disabled: busy, onClick: requestClose }, t('cancelEdit')), h('button', { type: 'button', className: 'ww-primary', disabled: busy || unverified, onClick: save }, t(entry ? 'skillSaveChanges' : 'skillCreate')))), discard);
  }

  // 一行技能的“类型”和“状态”：个人、团队（扩展来源名）、插件包、内置；状态只在有事时写字，正常是一个对勾。
  const groupOf = item => item.origin === 'extension' ? `ext:${item.extension.id}` : item.origin === 'pack' ? 'pack' : item.origin === 'agents' ? 'agents' : item.origin === 'project' ? `proj:${item.scope.id}` : item.origin === 'builtin' || item.origin === 'override' ? 'builtin' : 'mine';
  const typeText = item => item.origin === 'extension' ? [labelText(item.extension), item.note].filter(Boolean).join(' · ')
    : item.origin === 'pack' ? `插件包 · ${item.pack.title}` : item.origin === 'agents' ? '共用' : item.origin === 'project' ? `项目 · ${item.scope.label}`
    : item.origin === 'builtin' ? '内置' : item.origin === 'override' ? '内置 · 改过'
    : item.origin === 'evolution' ? '个人 · 提炼' : item.source?.kind === 'skills.sh' ? '个人 · skills.sh' : '个人';
  function statusOf(item, t) {
    if (item.issue) return { text: '需要修复', tone: 'error', title: item.issue };
    if (item.state === 'candidate') return { text: '候选', tone: 'warn' };
    if (item.state === 'disabled') return { text: '已停用', tone: 'muted' };
    if (item.review) return { text: '待复核', tone: 'warn' };
    if (item.baseUpdated) return { text: t('skillBaseUpdatedShort'), tone: 'warn' };
    if (item.discovery === 'shadowed') return { text: '被同名顶替', tone: 'warn', title: '另一项同名技能先被 DSH 用上了，这一项没有生效' };
    if (item.discovery === 'unavailable') return { text: '没生效', tone: 'warn', title: 'DSH 没有发现这项技能，检查文件夹和格式' };
    if (item.origin === 'extension') return { text: item.editable ? '可编辑' : '只读', tone: 'muted' };
    if (item.origin === 'agents') return { text: '', tone: 'ok', title: '放在共用目录，DSH 会用（鲸翼这里只读）' };
    if (item.origin === 'project') return { text: '', tone: 'ok', title: '在这个项目里干活时 DSH 会用（鲸翼这里只读）' };
    if (item.origin === 'pack') return item.pack.enabled ? { text: '', tone: 'ok', title: '插件包开着，可以用' } : { text: '包已停用', tone: 'muted', title: '所在的插件包停用了，这项技能暂时用不到' };
    return { text: '', tone: 'ok', title: item.discovery === 'catalogued' ? t('skillHelp') : '可以用' };
  }
  const matches = (item, filter) => filter === 'all' || (filter === 'updated' ? Boolean(item.baseUpdated) : filter === 'review' ? Boolean(item.review) : filter === 'issue' ? Boolean(item.issue) : groupOf(item) === filter);

  /** 我的 · 技能：筛选项（带数量）和分组好的行，页面外壳拿去画筛选菜单和摘要。 */
  function skillFilters(skills, extensions, packs, scopes) {
    // 改过的内置技能只显示改过的那一行（详情里能恢复原件），原件不再单列一行。
    const overridden = new Set(skills.filter(item => item.origin === 'override' && item.baseId).map(item => `${item.baseId}
${item.baseHash}`));
    const rows = [...skills.filter(item => !(item.origin === 'builtin' && overridden.has(`${item.id}
${item.hash}`))), ...extensions.flatMap(extension => extension.skills.map(item => ({ ...item, id: `extension:${extension.id}:${item.name}`, origin: 'extension', extension }))),
      ...(packs ?? []).flatMap(pack => pack.skills.map(item => ({ ...item, id: `pack:${pack.name}:${item.name}`, origin: 'pack', pack: { name: pack.name, title: pack.title, enabled: pack.enabled } }))),
      ...(scopes ?? []).flatMap(scope => scope.skills.map(item => ({ ...item, id: `scope:${item.path}`, origin: scope.kind === 'agents' ? 'agents' : 'project', scope: { id: scope.id, label: scope.label, root: scope.root } })))];
    const count = filter => rows.filter(item => matches(item, filter)).length;
    const options = [['all', '全部'], ['mine', '个人'], ['agents', '共用'], ...extensions.map(extension => [`ext:${extension.id}`, labelText(extension)]), ['pack', '插件包'], ['builtin', '内置'], ...(scopes ?? []).filter(scope => scope.kind === 'project').map(scope => [`proj:${scope.id}`, `项目 · ${scope.label}`]), ['updated', '原件有更新'], ['review', '待复核'], ['issue', '需要修复']]
      .map(([id, label]) => ({ id, label, count: count(id) })).filter(option => ['all', 'mine', 'builtin'].includes(option.id) || option.count > 0);
    return { rows, options, count };
  }

  /** 一组技能摆成一行两个；超过 6 个先露 6 个，下面“查看 A、B，另有 N 项”展开，展开后底下“收起”（照 Codex）。搜索时全部展开。 */
  function Tiles({ items, all, render }) {
    const [open, setOpen] = useState(false);
    const limit = 6, rest = items.slice(limit);
    const folded = !all && !open && rest.length > 0;
    return h(React.Fragment, null,
      h('ul', { className: 'ww-kit-tiles' }, ...(folded ? items.slice(0, limit) : items).map(render)),
      !all && rest.length > 0 && h('button', { type: 'button', className: 'ww-kit-more', 'aria-expanded': open, onClick: () => setOpen(!open) },
        open ? '收起' : `查看 ${rest.slice(0, 2).map(titleOf).join('、')}${rest.length > 2 ? `，另有 ${rest.length - 2} 项` : ''}`,
        h(Glyph, { name: open ? 'back' : 'chevron', size: 14 })));
  }

  // 自己的排在前面：个人、共用、团队、插件包、项目，最后是内置。
  const rank = item => ({ mine: 0, agents: 1, pack: 3, builtin: 5 })[groupOf(item)] ?? (groupOf(item).startsWith('ext:') ? 2 : 4);

  /**
   * 我的 · 技能（2026-11-09 用户定，照 Codex）：上面“已安装”是全部技能，一行两个、能展开收起；
   * 下面一排横向滚动的分类（个人、共用、各团队来源、插件包、内置、各项目），点一个看那一类。
   */
  function MineSkills({ rows, filter, query, sortDown, t, busy, onOpen, empty }) {
    const [picked, setPicked] = useState(null);
    const keyword = query.trim().toLowerCase();
    const shown = rows.filter(item => matches(item, filter) && (!keyword || `${item.name} ${titleOf(item)} ${item.description}`.toLowerCase().includes(keyword)))
      .sort((a, b) => rank(a) - rank(b) || (sortDown ? -1 : 1) * titleOf(a).localeCompare(titleOf(b), 'zh'));
    if (!rows.length) return empty;
    if (!shown.length) return h('p', { className: 'ww-kit-empty', role: 'status' }, '没有匹配的技能，换个词或筛选试试');
    const tile = item => {
      const status = statusOf(item, t);
      return h('li', { key: item.id }, h('button', { type: 'button', className: 'ww-kit-row', disabled: busy, onClick: () => onOpen(item) },
        h('span', { className: 'ww-kit-icon', 'data-tone': groupOf(item).startsWith('ext:') ? 'team' : ['pack', 'agents'].includes(groupOf(item)) || groupOf(item).startsWith('proj:') ? 'market' : groupOf(item), 'aria-hidden': true }, initial(titleOf(item))),
        h('span', { className: 'ww-kit-main' }, h('span', { className: 'ww-kit-name' }, titleOf(item)), h('small', { title: item.description }, h('span', { className: 'ww-kit-type' }, titled(item) && titleOf(item) !== item.name ? `${typeText(item)} · ${item.name}` : typeText(item)), ' · ', item.description || '没有说明')),
        h('span', { className: 'ww-kit-status', 'data-tone': status.tone, title: status.title }, status.tone === 'ok' ? h(Glyph, { name: 'check', size: 16 }) : status.text)));
    };
    const extensionsShown = [...new Map(rows.filter(item => item.origin === 'extension').map(item => [item.extension.id, item.extension])).values()];
    const projects = [...new Map(rows.filter(item => item.origin === 'project').map(item => [item.scope.id, item.scope])).values()].sort((a, b) => a.label.localeCompare(b.label, 'zh'));
    const groups = [['mine', '个人'], ['agents', '共用'], ...extensionsShown.map(extension => [`ext:${extension.id}`, labelText(extension)]), ['pack', '插件包'], ['builtin', '内置'], ...projects.map(scope => [`proj:${scope.id}`, scope.label])]
      .filter(([id]) => id === 'mine' || rows.some(item => groupOf(item) === id));
    const current = groups.some(([id]) => id === picked) ? picked : (groups.find(([id]) => shown.some(item => groupOf(item) === id)) ?? groups[0])[0];
    const inGroup = shown.filter(item => groupOf(item) === current);
    const label = groups.find(([id]) => id === current)?.[1];
    return h('div', { className: 'ww-kit-mine' },
      h('section', { className: 'ww-kit-group', 'aria-label': '已安装' },
        h('h3', null, '已安装', h('small', null, String(shown.length))),
        h(Tiles, { key: `${filter}|${keyword}|${sortDown}`, items: shown, all: Boolean(keyword), render: tile })),
      h('div', { className: 'ww-kit-chips', role: 'group', 'aria-label': '按来源和项目看' },
        ...groups.map(([id, text]) => h('button', { type: 'button', key: id, className: 'ww-chip', 'aria-pressed': id === current, title: id.startsWith('proj:') ? `项目里的技能，只在这个项目里干活时 DSH 才用` : undefined, onClick: () => setPicked(id) }, text, h('small', null, String(shown.filter(item => groupOf(item) === id).length))))),
      h('section', { className: 'ww-kit-group', 'aria-label': label },
        inGroup.length ? h(Tiles, { key: `${current}|${filter}|${keyword}|${sortDown}`, items: inGroup, all: Boolean(keyword), render: tile })
          : h('p', { className: 'ww-kit-note', role: 'status' }, current === 'mine' && !keyword ? '还没有个人技能。点右上角“添加”新建、上传，或到“发现”里从 skills.sh 装。' : '这一类里没有匹配的技能')));
  }

  /** 点开一项技能：右侧抽屉看说明、状态、正文和来源，底部是这项能做的操作。 */
  function SkillDrawer({ skill, t, busy, assistantShort, onClose, onEdit, onAsk, onAssist, onToggle, onOpenPack }) {
    const status = statusOf(skill, t);
    const reviewText = review => [review.changed.length > 0 && `来源笔记有改动：${review.changed.join('、')}。`, review.missing.length > 0 && `来源笔记找不到（可能移动或删除了）：${review.missing.join('、')}。`, review.otherVault && '来源在另一个知识库，暂时没法核对。', `技能照常可用；可以和${assistantShort}核对后重新提炼。`].filter(Boolean).join('');
    const footer = [];
    if (skill.origin === 'user') footer.push(h('button', { key: 'remove', type: 'button', className: 'ww-danger-text', disabled: busy, onClick: () => onAsk('remove') }, t('removeSkill')));
    if (skill.origin === 'override') footer.push(h('button', { key: 'reset', type: 'button', disabled: busy, onClick: () => onAsk('reset') }, t('resetSkill')));
    if (skill.origin === 'evolution' && skill.state !== 'candidate') footer.push(
      h('button', { key: 'toggle', type: 'button', disabled: busy, onClick: onToggle }, t(skill.state === 'active' ? 'disable' : 'restoreSkill')),
      h('button', { key: 'rollback', type: 'button', disabled: busy, onClick: () => onAsk('rollback') }, t('rollbackSkill')));
    footer.push(h('span', { key: 'gap', className: 'ww-grow' }));
    if (skill.origin === 'evolution') footer.push(h('button', { key: 'assist', type: 'button', className: 'ww-primary', disabled: busy, onClick: onAssist }, t('skillEdit')));
    else if (skill.actions?.includes('update') || skill.editable) footer.push(h('button', { key: 'edit', type: 'button', className: 'ww-primary', disabled: busy, onClick: onEdit }, t('editSkill')));
    else if (skill.origin === 'pack' && onOpenPack) footer.push(h('button', { key: 'pack', type: 'button', onClick: onOpenPack }, '查看插件包'));
    else footer.push(h('button', { key: 'close', type: 'button', onClick: onClose }, '关闭'));
    return h(Drawer, { title: titleOf(skill), busy, onClose, footer },
      h('dl', { className: 'ww-kit-facts' },
        titled(skill) && titleOf(skill) !== skill.name && h(React.Fragment, null, h('dt', null, '技能名'), h('dd', null, h('code', null, skill.name))),
        h('dt', null, '说明'), h('dd', null, skill.description || '没有说明'),
        h('dt', null, '类型'), h('dd', null, typeText(skill), skill.source?.kind === 'skills.sh' && h('a', { href: marketPage(skill.source.id), target: '_blank', rel: 'noreferrer' }, ` · ${skill.source.id}`)),
        h('dt', null, '状态'), h('dd', { title: status.title }, status.tone === 'ok' ? '可以用' : status.text)),
      skill.origin === 'extension' && h('p', { className: 'ww-notice', role: 'status' }, skill.editable ? `这项技能由「${labelText(skill.extension)}」提供；你是维护人，改完保存会交给「${labelText(skill.extension)}」同步给大家` : t('skillExtensionHelp', { name: labelText(skill.extension) })),
      skill.origin === 'builtin' && h('p', { className: 'ww-notice' }, t('skillBuiltinHelp')),
      skill.origin === 'agents' && h('p', { className: 'ww-notice', role: 'status' }, `这项技能放在共用目录（${skill.scope.root}），DSH、Codex 等 AI 工具都会读；鲸翼这里只读，要改就改那个文件夹里的 SKILL.md。`),
      skill.origin === 'project' && h('p', { className: 'ww-notice', role: 'status' }, `这项技能在项目「${skill.scope.label}」里（${skill.scope.root}），只有在这个项目里干活时 DSH 才会用；鲸翼这里只读。`),
      skill.origin === 'pack' && h('p', { className: 'ww-notice', role: 'status' }, `这项技能来自插件包「${skill.pack.title}」，只读；${skill.pack.enabled ? '不想用就到“插件”里停用整个包' : '这个包停用了，专家暂时用不到它'}。`),
      skill.issue && h('p', { className: 'ww-notice ww-error', role: 'status' }, `${t('skillIssue')}：${skill.issue}`),
      skill.baseUpdated && h('p', { className: 'ww-notice', role: 'status' }, t('skillBaseUpdated')),
      skill.review && h('p', { className: 'ww-notice', role: 'status' }, h('span', { className: 'ww-tag ww-tag-warn' }, '待复核'), ' ', reviewText(skill.review)),
      h('pre', { className: 'ww-kit-content' }, skill.content),
      skill.sourcePaths?.length > 0 && h(React.Fragment, null, h('h3', { className: 'ww-kit-subhead' }, t('sourcePaths')), h('ul', { className: 'ww-kit-paths' }, ...skill.sourcePaths.map(source => h('li', { key: source }, source)))));
  }

  /** 维护人改团队技能：只改 SKILL.md 正文，保存交给提供它的扩展；没改动直接关，有改动先确认放弃。 */
  function TeamSkillEditor({ skill, t, onClose, onSave }) {
    const [content, setContent] = useState(skill.content);
    const [busy, setBusy] = useState(false);
    const [requestClose, discard] = useDiscard({ dirty: content !== skill.content, onClose, busy });
    const save = async () => { setBusy(true); try { await onSave(content); } finally { setBusy(false); } };
    return h(React.Fragment, null, h(Drawer, { title: t('editSkill'), busy, onClose: requestClose, footer: [
      h('button', { key: 'cancel', type: 'button', disabled: busy, onClick: requestClose }, t('cancelEdit')),
      h('button', { key: 'save', type: 'button', className: 'ww-primary', disabled: busy || content === skill.content || !content.trim(), onClick: save }, t('skillSaveChanges')),
    ] },
      h('p', { className: 'ww-notice' }, `改的是「${skill.name}」的 SKILL.md，保存后交给「${labelText(skill.extension)}」同步给大家；技能里的其他文件（脚本、参考资料）到它自己的管理页面换。`),
      h('label', null, t('skillContent'), h('textarea', { value: content, disabled: busy, onChange: event => setContent(event.target.value), spellCheck: false }))), discard);
  }

  /** 发现 · 技能：skills.sh 的官方技能和安装最多的，搜索时换成搜索结果。卡片两列，“＋”先打开预览再装。 */
  function DiscoverSkills({ market, results, searching, query, filter, sortDown, installedNames, busy, onOpen, onRefresh }) {
    const [expanded, setExpanded] = useState('');
    const card = item => {
      const installed = installedNames.has(item.name);
      return h('li', { key: item.id }, h('button', { type: 'button', className: 'ww-kit-card', disabled: busy, onClick: () => onOpen(item), 'aria-label': `${item.name}，${item.source}${installed ? '，已安装' : ''}` },
        h('span', { className: 'ww-kit-icon', 'data-tone': item.official ? 'official' : 'market', 'aria-hidden': true }, initial(item.name)),
        h('span', { className: 'ww-kit-main' }, h('span', { className: 'ww-kit-name' }, item.name), h('small', null, item.source), h('small', null, installsText(item.installs), item.official ? ' · 官方' : '')),
        installed ? h('span', { className: 'ww-tag' }, '已安装') : h('span', { className: 'ww-kit-add', 'aria-hidden': true }, h(Glyph, { name: 'plus', size: 16 }))));
    };
    const order = list => [...list].sort((a, b) => (sortDown ? 1 : -1) * (a.installs - b.installs));
    const section = (id, title, list) => {
      if (!list.length) return null;
      const all = expanded === id, items = order(list);
      return h('section', { key: id, className: 'ww-kit-shelf' },
        h('header', null, h('h3', null, title, h('i', { className: 'ww-cloud', 'aria-hidden': true })), items.length > 6 && h('button', { type: 'button', className: 'ww-kit-more', onClick: () => setExpanded(all ? '' : id) }, all ? '收起' : '显示全部', h(Glyph, { name: all ? 'back' : 'chevron', size: 14 }))),
        h('ul', { className: 'ww-kit-cards' }, ...(all ? items : items.slice(0, 6)).map(card)));
    };
    if (query.trim().length >= 2) {
      if (searching) return h('p', { className: 'ww-kit-empty', role: 'status' }, '正在搜 skills.sh…');
      if (!results) return null;
      return results.length ? h('ul', { className: 'ww-kit-cards' }, ...order(results).map(card)) : h('p', { className: 'ww-kit-empty', role: 'status' }, 'skills.sh 上没搜到，换个英文关键词试试（技能大多是英文名）');
    }
    if (!market) return h('p', { className: 'ww-kit-empty', role: 'status' }, '正在读 skills.sh…');
    if (market.issue && !market.total) return h('div', { className: 'ww-kit-empty', role: 'status' }, h('p', null, market.issue), h('button', { type: 'button', onClick: onRefresh }, '重新读取'));
    return h('div', { className: 'ww-kit-shelves' },
      filter !== 'popular' && section('official', '官方技能', market.official),
      filter !== 'official' && section('popular', '安装最多', market.popular),
      h('p', { className: 'ww-kit-note' }, '技能来自 skills.sh，由各自作者维护；装之前先看一眼说明和带的文件。', h('a', { href: 'https://skills.sh', target: '_blank', rel: 'noreferrer' }, '打开 skills.sh')));
  }

  /** skills.sh 技能预览：说明、来源、带哪些文件（有脚本时提醒），底部“安装”。 */
  function MarketDrawer({ item, preview, installed, busy, onClose, onInstall }) {
    const footer = [
      h('a', { key: 'site', className: 'ww-kit-link', href: marketPage(item.id), target: '_blank', rel: 'noreferrer' }, '在 skills.sh 查看', h(Glyph, { name: 'external', size: 14 })),
      h('span', { key: 'gap', className: 'ww-grow' }),
      h('button', { key: 'install', type: 'button', className: 'ww-primary', disabled: busy || !preview || installed, onClick: onInstall }, installed ? '已安装' : '安装'),
    ];
    return h(Drawer, { title: item.name, busy, onClose, footer },
      h('dl', { className: 'ww-kit-facts' },
        h('dt', null, '来源'), h('dd', null, item.source),
        h('dt', null, '安装'), h('dd', null, installsText(item.installs), item.official ? ' · 官方' : ''),
        h('dt', null, '说明'), h('dd', null, preview ? preview.description || '没有说明' : '正在读…'),
        preview && h(React.Fragment, null, h('dt', null, '文件'), h('dd', null, `${preview.files.length} 个文件`))),
      installed && h('p', { className: 'ww-notice', role: 'status' }, `你已经有一项叫「${item.name}」的技能了；要换成这份，先在“我的”里删掉原来那个`),
      preview?.scripts.length > 0 && h('p', { className: 'ww-notice ww-warn', role: 'status' }, `这项技能带了 ${preview.scripts.length} 个脚本（${preview.scripts.slice(0, 3).join('、')}${preview.scripts.length > 3 ? ' 等' : ''}）。专家用它时可能会运行这些脚本，DSH 照常先问你；不认识作者的话先看看脚本内容。`),
      preview && h('pre', { className: 'ww-kit-content' }, preview.content));
  }

  return { SkillEditor, TeamSkillEditor, MineSkills, SkillDrawer, DiscoverSkills, MarketDrawer, skillFilters };
}
