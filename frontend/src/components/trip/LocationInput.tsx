import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import type { LocationSuggestion } from '../../types/routing';
import { searchLocations } from '../../services/routingApi';
import { cn } from '../../lib/cn';
import { Field, TextInput, fieldDescribedBy } from '../common/Input';

interface LocationInputProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  error?: string | null;
  icon?: ReactNode;
  onChange: (value: string) => void;
  onBlur: () => void;
}

const SEARCH_DEBOUNCE_MS = 200;

export function LocationInput({ id, label, value, placeholder, error, icon, onChange, onBlur }: LocationInputProps) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Stays null after a suggestion is picked so it doesn't trigger another search.
  const [query, setQuery] = useState<string | null>(null);
  const blurTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchLocations(query, controller.signal)
        .then((results) => {
          setSuggestions(results);
          setActiveIndex(-1);
          setOpen(results.length > 0);
        })
        .catch(() => setSuggestions([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => () => window.clearTimeout(blurTimerRef.current), []);

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    onChange(suggestion.name);
    setQuery(null);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <Field id={id} label={label} error={error}>
      <div className="relative">
        <TextInput
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          invalid={Boolean(error)}
          icon={icon}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={fieldDescribedBy(id, error)}
          onChange={(event) => {
            onChange(event.target.value);
            setQuery(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && query !== null && setOpen(true)}
          onBlur={() => {
            blurTimerRef.current = window.setTimeout(() => setOpen(false), 100);
            onBlur();
          }}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          hidden={!showList}
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-auto rounded-control border border-line bg-surface py-1 shadow-float"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'flex cursor-pointer items-start gap-2 px-3 py-2',
                index === activeIndex && 'bg-surface-hover',
              )}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-body text-ink">{suggestion.name}</span>
                <span className="block truncate text-meta text-ink-muted">{suggestion.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Field>
  );
}
