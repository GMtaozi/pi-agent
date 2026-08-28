import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export function markdownToHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      'h1','h2','h3','h4','h5','h6',
      'p','br','hr',
      'strong','em','del','ins',
      'ul','ol','li',
      'blockquote','pre','code',
      'table','thead','tbody','tr','th','td',
      'a','img',
      'div','span','sup','sub'
    ],
    allowedAttributes: {
      a: ['href','title','target','rel'],
      img: ['src','alt','title'],
      code: ['class'],
      pre: ['class'],
      span: ['class'],
      div: ['class']
    },
    allowedSchemes: ['http','https','mailto'],
    allowedSchemesByTag: {},
    transformTags: {
      'a': sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' })
    }
  });
}
