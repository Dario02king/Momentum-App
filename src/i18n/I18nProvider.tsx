import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Language } from '../core/model';
import { createTranslator, DEFAULT_LANGUAGE, localeOf, type Translator } from './index';

interface I18nValue {
  language: Language;
  t: Translator;
  locale: string;
  setLanguage(language: Language): void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  language,
  setLanguage,
  children,
}: {
  language: Language;
  setLanguage(language: Language): void;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({ language, t: createTranslator(language), locale: localeOf(language), setLanguage }),
    [language, setLanguage],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value) return value;
  // A component rendered outside the provider still shows German rather than
  // raw keys — the string layer is never the reason a screen breaks.
  return {
    language: DEFAULT_LANGUAGE,
    t: createTranslator(DEFAULT_LANGUAGE),
    locale: localeOf(DEFAULT_LANGUAGE),
    setLanguage: () => undefined,
  };
}

export function useT(): Translator {
  return useI18n().t;
}
