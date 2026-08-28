import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const components: Components = {
  code({ className: codeClassName, children, ...props }) {
    const match = /language-(\w+)/.exec(codeClassName || '');
    const language = match ? match[1] : '';
    const codeString = String(children).replace(/\n$/, '');

    if (match && codeString) {
      return (
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{
            margin: '12px 0',
            borderRadius: '8px',
            fontSize: '13px',
            lineHeight: '1.6',
          }}
        >
          {codeString}
        </SyntaxHighlighter>
      );
    }

    return (
      <code className={codeClassName} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  p({ children }) {
    return <p style={{ margin: '0 0 12px' }}>{children}</p>;
  },
  ul({ children }) {
    return <ul style={{ margin: '0 0 12px', paddingLeft: '24px' }}>{children}</ul>;
  },
  ol({ children }) {
    return <ol style={{ margin: '0 0 12px', paddingLeft: '24px' }}>{children}</ol>;
  },
  li({ children }) {
    return <li style={{ margin: '2px 0' }}>{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote
        style={{
          margin: '0 0 12px',
          padding: '8px 16px',
          borderLeft: '4px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
        }}
      >
        {children}
      </blockquote>
    );
  },
  h1({ children }) {
    return <h1 style={{ fontSize: '24px', fontWeight: '600', margin: '0 0 12px' }}>{children}</h1>;
  },
  h2({ children }) {
    return <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 12px' }}>{children}</h2>;
  },
  h3({ children }) {
    return <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 12px' }}>{children}</h3>;
  },
  table({ children }) {
    return (
      <div style={{ overflowX: 'auto', margin: '0 0 12px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '14px',
          }}
        >
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th
        style={{
          border: '1px solid var(--border-color)',
          padding: '8px 12px',
          background: 'var(--bg-secondary)',
          fontWeight: '600',
          textAlign: 'left',
        }}
      >
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td
        style={{
          border: '1px solid var(--border-color)',
          padding: '8px 12px',
        }}
      >
        {children}
      </td>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'var(--accent-color)', textDecoration: 'none' }}
      >
        {children}
      </a>
    );
  },
  hr() {
    return (
      <hr
        style={{
          border: 'none',
          borderTop: '1px solid var(--border-color)',
          margin: '16px 0',
        }}
      />
    );
  },
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  return (
    <div className={`markdown-body ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeSanitize, {
            ...defaultSchema,
            attributes: {
              ...defaultSchema.attributes,
              code: [...(defaultSchema.attributes?.code || []), 'className'],
              pre: [...(defaultSchema.attributes?.pre || []), 'className']
            }
          }]
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default memo(MarkdownRenderer);
