import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export type SearchFormProps = {
  /** Pre-fills the box so the reader can refine rather than retype. */
  defaultQuery?: string;
  /** Max characters accepted — mirrors the server-side 400. */
  maxLength: number;
  error?: string;
};

/**
 * The search box.
 *
 * A plain `<form method="get" action="/search">`: submitting navigates to a
 * real, shareable, crawlable URL and works with JavaScript disabled. There is
 * no client-side state here, so there is no reason for this to be a client
 * component. `maxLength` is a courtesy, not the enforcement — the server
 * rejects an over-long query with a 400 regardless.
 */
export function SearchForm({ defaultQuery = '', maxLength, error }: SearchFormProps) {
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1">
        <Input
          label="Search stories"
          name="q"
          type="search"
          defaultValue={defaultQuery}
          maxLength={maxLength}
          placeholder="Try a topic, a title, or a phrase"
          autoComplete="off"
          error={error}
        />
      </div>
      <Button type="submit" className="shrink-0 self-start sm:self-auto">
        Search
      </Button>
    </form>
  );
}

export default SearchForm;
