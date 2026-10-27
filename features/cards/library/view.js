import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

const plain = node => node.value ?? (node.children || []).map(plain).join('');
export const bookImageName = /^img-\d{4}\.(?:jpg|png|gif|webp|bmp|avif|svg)$/;

/**
 * 章节 Markdown 转成阅读树：节点种类与笔记阅读相同，另加 image（url 是书内图片名，value 是替代文字）。
 * 只有书内图片成为 image 节点；外部图片地址只留替代文字，不触发网络请求。
 */
export function bookView(markdown) {
  const tree = fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const view = node => {
    const line = node.position?.start.line || 1;
    if (node.type === 'definition') return null;
    if (node.type === 'image') return bookImageName.test(node.url) ? { type: 'image', url: node.url, value: node.alt || '', line } : { type: 'text', value: node.alt || '', line };
    if (node.type === 'imageReference') return { type: 'text', value: node.alt || '', line };
    if (node.type === 'link') return { type: 'link', url: node.url, value: plain(node), line };
    if (node.type === 'linkReference') return { type: 'text', value: plain(node), line };
    if (node.type === 'html') return { type: 'text', value: node.value, line };
    if (node.type === 'footnoteReference') return { type: 'text', value: `[^${node.label || node.identifier}]`, line };
    return {
      type: node.type, line,
      ...(typeof node.value === 'string' ? { value: node.value } : {}),
      ...(node.type === 'heading' ? { level: node.depth } : {}),
      ...(node.type === 'list' ? { ordered: node.ordered, start: node.start ?? 1 } : {}),
      ...(node.type === 'listItem' && typeof node.checked === 'boolean' ? { checked: node.checked } : {}),
      ...(node.children ? { children: node.children.map(view).filter(Boolean) } : {}),
    };
  };
  return view(tree);
}

/** 章节开头的一段纯文字，用于首页卡片摘要。 */
export function bookExcerpt(markdown, length = 160) {
  const text = markdown.split('\n').filter(line => !/^\s*(?:#{1,6}\s|!\[|\||```|~~~|-{3,}\s*$)/.test(line)).join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\\(.)/g, '$1').replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}
