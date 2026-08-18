import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { SaveStatus } from '@/components/editor/SaveStatus';
import { TagInput } from '@/components/editor/TagInput';
import { MAX_TAGS_PER_STORY } from '@/lib/types';

/**
 * Accessibility contract for the editor chrome.
 *
 * These assertions exist because every one of them is a claim made in a code
 * comment, and a claim nothing checks rots. They are deliberately about
 * SEMANTICS, not styling: that the controls are real buttons, that they are
 * named, that toggles expose their state, and that asynchronous status reaches
 * a live region. A screen-reader user's experience of this editor is exactly
 * the set of properties asserted below.
 *
 * The ProseMirror surface itself is exercised by the Playwright journey rather
 * than here — a contenteditable in jsdom tests jsdom, not the editor.
 */

afterEach(cleanup);

describe('EditorToolbar', () => {
  it('renders every control as a real, named <button>', () => {
    render(<EditorToolbar editor={null} />);

    for (const label of [
      'Bold',
      'Italic',
      'Heading level 1',
      'Heading level 2',
      'Block quote',
      'Code block',
      'Bulleted list',
      'Numbered list',
      'Horizontal rule',
      'Link',
      'Insert image',
    ]) {
      const button = screen.getByRole('button', { name: label });
      expect(button.tagName).toBe('BUTTON');
      // type="button" — an unqualified button inside a form submits it.
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('exposes toggle state through aria-pressed, not colour alone', () => {
    render(<EditorToolbar editor={null} />);

    for (const label of ['Bold', 'Italic', 'Heading level 1', 'Bulleted list']) {
      expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    }
  });

  it('marks the link and image panels as disclosure widgets', () => {
    render(<EditorToolbar editor={null} />);

    const link = screen.getByRole('button', { name: 'Link' });
    const image = screen.getByRole('button', { name: 'Insert image' });

    expect(link.getAttribute('aria-expanded')).toBe('false');
    expect(link.getAttribute('aria-controls')).toBeTruthy();
    expect(image.getAttribute('aria-expanded')).toBe('false');
    expect(image.getAttribute('aria-controls')).toBeTruthy();
  });

  it('groups the controls in a labelled toolbar', () => {
    render(<EditorToolbar editor={null} />);

    expect(screen.getByRole('toolbar', { name: 'Text formatting' })).toBeTruthy();
  });

  it('disables every control when there is no editor yet', () => {
    render(<EditorToolbar editor={null} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe('SaveStatus', () => {
  it('is a polite live region that exists before the text changes', () => {
    const { container } = render(<SaveStatus state="idle" />);

    const region = container.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('aria-live')).toBe('polite');
  });

  it('announces each state in words, not only an icon', () => {
    const { rerender } = render(<SaveStatus state="saving" />);
    expect(screen.getByRole('status').textContent).toContain('Saving');

    rerender(<SaveStatus state="saved" savedAt="2026-01-01T10:00:00.000Z" />);
    expect(screen.getByRole('status').textContent).toContain('Saved');

    rerender(<SaveStatus state="error" error="Use at most 5 tags" />);
    // The SERVER's message reaches the user, not a generic failure string.
    expect(screen.getByRole('status').textContent).toContain('Use at most 5 tags');
  });
});

describe('TagInput', () => {
  it('has a real <label>, not a placeholder standing in for one', () => {
    render(<TagInput tags={[]} onChange={vi.fn()} />);

    const field = screen.getByLabelText('Topics');
    expect(field.tagName).toBe('INPUT');
  });

  it('adds a tag on Enter, lowercased and trimmed', () => {
    const onChange = vi.fn();
    render(<TagInput tags={[]} onChange={onChange} />);

    const field = screen.getByLabelText('Topics');
    fireEvent.change(field, { target: { value: '  Design  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['design']);
  });

  it('names each remove button after its own tag', () => {
    render(<TagInput tags={['design', 'writing']} onChange={vi.fn()} />);

    // Five buttons all called "Remove" would be unusable read out of context.
    expect(screen.getByRole('button', { name: 'Remove tag design' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove tag writing' })).toBeTruthy();
  });

  it('removes the right tag when its button is pressed', () => {
    const onChange = vi.fn();
    render(<TagInput tags={['design', 'writing']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag design' }));

    expect(onChange).toHaveBeenCalledWith(['writing']);
  });

  it('stops at the cap and says so in a live region', () => {
    const onChange = vi.fn();
    const full = ['a', 'b', 'c', 'd', 'e'];
    expect(full).toHaveLength(MAX_TAGS_PER_STORY);

    render(<TagInput tags={full} onChange={onChange} />);

    const field = screen.getByLabelText('Topics') as HTMLInputElement;
    expect(field.disabled).toBe(true);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('refuses a duplicate without calling onChange', () => {
    const onChange = vi.fn();
    render(<TagInput tags={['design']} onChange={onChange} />);

    const field = screen.getByLabelText('Topics');
    fireEvent.change(field, { target: { value: 'DESIGN' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('already added');
  });

  it('reports the remaining allowance in the field hint', () => {
    render(<TagInput tags={['design']} onChange={vi.fn()} />);

    const field = screen.getByLabelText('Topics');
    const hintId = field.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toContain(
      `1 of ${MAX_TAGS_PER_STORY} used`,
    );
  });
});
