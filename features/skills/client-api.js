
/** 领域状态与读回只在本模块持有，宿主机制通过显式桥接消费。 */
export function createSkillsClient(bridge, t) {
    const { featureRemote, unwrap, failure } = bridge;
    // 宿主答复了失败（answered）：它那边这次请求已经整个结束，之后不会再有迟到的写入；没收到答复的失败（断线等）不打这个标记。
    const skillRequest = async (input, signal) => {
      const reply = await featureRemote('whalewingSkills').manageSkills(input, signal);
      try { return unwrap(reply); } catch (error) { throw Object.assign(error, { answered: true }); }
    };
    const resolveSkillEdit = async (entry, signal) => {
      if (entry?.origin !== 'builtin' || !entry.editId) return entry;
      const target = (await skillRequest({ action: 'read', id: entry.editId }, signal)).entry;
      if (!target) return entry;
      if (target.origin !== 'override' || target.baseId !== entry.id || target.baseHash !== entry.hash) throw failure(t('skillOverrideConflict'), 'skill_origin_conflict');
      return target;
    };

  return {
    skillRequest, resolveSkillEdit,
  };
}
