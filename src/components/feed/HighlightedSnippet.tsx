import { cn } from '@/lib/cn';
import type { SnippetSegment } from '@/server/search/highlight';

export type HighlightedSnippetProps = {
  segments: SnippetSegment[];
  className?: string;
};

/**
 * A search snippet with the matched terms marked.
 *
 * SECURITY — the reason this component exists: story bodies are author-supplied
 * HTML, and this is the one surface that shows text from EVERY story on the
 * site. Rendering a pre-built `<mark>`-wrapped string here would mean
 * dangerouslySetInnerHTML over that content. Instead the server hands back
 * plain-text segments and React emits each one as a text node, so `<script>`
 * in a story body renders as the visible characters `<script>` and nothing
 * else. There is no HTML path from story content to this component.
 */
export function HighlightedSnippet({ segments, className }: HighlightedSnippetProps) {
  if (segments.length === 0) return null;

  return (
    <p className={cn('text-ink-muted', className)}>
      {/* Index keys are correct here: a snippet is a fixed, positional list
          produced fresh on every render — there is no reorder to track. */}
      {segments.map((segment, index) =>
        segment.highlight ? (
          <mark key={index} className="rounded bg-accent/15 px-0.5 text-ink">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export default HighlightedSnippet;
