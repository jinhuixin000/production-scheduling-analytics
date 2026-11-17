const KEYWORDS = /\b(SELECT|FROM|WHERE|GROUP BY|GROUPING SETS|ORDER BY|QUALIFY|PARTITION BY|OVER|WITH|AS|CASE|WHEN|THEN|ELSE|END|AND|OR|NOT|BETWEEN|IS|NULL|CREATE|REPLACE|TABLE|VIEW|UNION ALL|UNION|FULL JOIN|JOIN|USING|HAVING|DESC|ALL|DISTINCT|LIMIT|IN)\b/g

/** Tiny SQL highlighter: comments, strings, numbers, keywords. Escapes HTML first. */
export function highlightSql(sql: string): string {
  return sql.split('\n').map((line) => {
    const idx = line.indexOf('--')
    const code = idx >= 0 ? line.slice(0, idx) : line
    const comment = idx >= 0 ? line.slice(idx) : ''
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const body = esc(code)
      .split(/('[^']*')/)
      .map((part, i) => (i % 2 ? `<span class="s">${part}</span>` : part.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="n">$1</span>').replace(KEYWORDS, '<span class="k">$1</span>')))
      .join('')
    return body + (comment ? `<span class="c">${esc(comment)}</span>` : '')
  }).join('\n')
}

export default function Sql({ code, maxHeight = 420 }: { code: string; maxHeight?: number }) {
  return <pre className="sql rounded-xl border border-line bg-black/30 p-4" style={{ maxHeight }} dangerouslySetInnerHTML={{ __html: highlightSql(code) }} />
}
