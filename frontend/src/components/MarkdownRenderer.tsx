import React, { useState } from 'react';

const Spoiler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = useState(false);
  
  return (
    <span 
      onClick={(e) => { e.stopPropagation(); setRevealed(true); }}
      style={{
        background: revealed ? 'rgba(255,255,255,0.1)' : '#1e1f22',
        color: revealed ? 'inherit' : 'transparent',
        padding: '0 4px',
        borderRadius: '4px',
        cursor: revealed ? 'auto' : 'pointer',
        transition: 'background 0.2s',
        userSelect: revealed ? 'auto' : 'none'
      }}
      title={revealed ? '' : 'Click to reveal spoiler'}
    >
      {children}
    </span>
  );
};

export const MarkdownRenderer: React.FC<{ content: string; edited?: boolean }> = ({ content, edited }) => {
  if (!content) return null;

  const parseInline = (text: string): React.ReactNode[] => {
    const tokens: React.ReactNode[] = [];
    let current = text;

    while (current.length > 0) {
      // 1. Spoilers ||text||
      const spoilerMatch = current.match(/^\|\|(.*?)\|\|/);
      if (spoilerMatch) {
        tokens.push(<Spoiler key={tokens.length}>{parseInline(spoilerMatch[1])}</Spoiler>);
        current = current.slice(spoilerMatch[0].length);
        continue;
      }

      // 2. Bold **text**
      const boldMatch = current.match(/^\*\*(.*?)\*\*/);
      if (boldMatch) {
        tokens.push(<strong key={tokens.length}>{parseInline(boldMatch[1])}</strong>);
        current = current.slice(boldMatch[0].length);
        continue;
      }

      // 3. Italics *text* or _text_
      const italicMatch = current.match(/^(\*|_)(.*?)\1/);
      if (italicMatch) {
        tokens.push(<em key={tokens.length}>{parseInline(italicMatch[2])}</em>);
        current = current.slice(italicMatch[0].length);
        continue;
      }

      // 4. Underline __text__
      const underlineMatch = current.match(/^__(.*?)__/);
      if (underlineMatch) {
        tokens.push(<u key={tokens.length}>{parseInline(underlineMatch[1])}</u>);
        current = current.slice(underlineMatch[0].length);
        continue;
      }

      // 5. Strikethrough ~~text~~
      const strikeMatch = current.match(/^~~(.*?)~~/);
      if (strikeMatch) {
        tokens.push(<del key={tokens.length}>{parseInline(strikeMatch[1])}</del>);
        current = current.slice(strikeMatch[0].length);
        continue;
      }

      // 6. Inline Code `text`
      const codeMatch = current.match(/^`([^`]+)`/);
      if (codeMatch) {
        tokens.push(
          <code key={tokens.length} style={{ background: '#1e1f22', padding: '2px 4px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '13px' }}>
            {codeMatch[1]}
          </code>
        );
        current = current.slice(codeMatch[0].length);
        continue;
      }

      // 7. Links http...
      const linkMatch = current.match(/^(https?:\/\/[^\s]+)/);
      if (linkMatch) {
        tokens.push(
          <a key={tokens.length} href={linkMatch[1]} target="_blank" rel="noopener noreferrer" style={{ color: '#00aff4', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.textDecoration='underline'} onMouseLeave={e => e.currentTarget.style.textDecoration='none'}>
            {linkMatch[1]}
          </a>
        );
        current = current.slice(linkMatch[0].length);
        continue;
      }

      // Plain text character
      tokens.push(current[0]);
      current = current.slice(1);
    }

    return tokens;
  };

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // close block
        elements.push(
          <pre key={i} style={{ background: '#1e1f22', padding: '8px', borderRadius: '4px', overflowX: 'auto', fontFamily: 'monospace', fontSize: '13px', margin: '4px 0', border: '1px solid rgba(255,255,255,0.05)' }}>
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBuffer = [];
      } else {
        // open block
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} style={{ borderLeft: '4px solid #4f545c', margin: '4px 0', paddingLeft: '12px', color: '#b9bbbe' }}>
          {parseInline(line.substring(2))}
        </blockquote>
      );
      continue;
    }

    const isLastLine = i === lines.length - 1;
    elements.push(
      <div key={i} style={{ minHeight: line.trim() === '' ? '14px' : 'auto', display: 'inline' }}>
        {parseInline(line)}
        {edited && isLastLine && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px', userSelect: 'none' }}>(edited)</span>
        )}
      </div>
    );
  }

  return <div style={{ display: 'flex', flexDirection: 'column' }}>{elements}</div>;
};
