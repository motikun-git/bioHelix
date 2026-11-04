import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STRINGS } from './strings.js';

/**
 * Bangla / English for the public website, login and student portal.
 * The admin panel stays in English (it wraps itself in <LangProvider forced="en">).
 * The choice is remembered in this browser.
 */
const KEY = 'bh-lang';
const LangContext = createContext(null);

function savedLang() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'bn' ? v : 'bn';
  } catch {
    return 'bn';
  }
}

export function LangProvider({ forced, children }) {
  const [chosen, setChosen] = useState(savedLang);
  const lang = forced || chosen;

  const setLang = useCallback((next) => {
    setChosen(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: just don't remember */
    }
  }, []);

  useEffect(() => {
    if (!forced) document.documentElement.lang = lang;
  }, [lang, forced]);

  const value = useMemo(() => {
    const t = (key, vars) => {
      let text = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, v);
      return text;
    };
    // Numbers in the reader's digits: n(42) → "৪২" in Bangla
    const n = (v) => (v === null || v === undefined ? '–' : lang === 'bn' ? bnDigits(v) : String(v));
    return { lang, setLang: forced ? () => {} : setLang, t, n, locale: lang === 'bn' ? 'bn-BD' : 'en-GB' };
  }, [lang, setLang, forced]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT() {
  return useContext(LangContext);
}

/** "বাংলা | English" switch. */
export function LangToggle({ light = true }) {
  const { lang, setLang } = useT();
  const base = light ? 'text-white/70 hover:text-white' : 'text-ink-soft hover:text-ink';
  const on = light ? 'bg-white/15 text-white' : 'bg-ink text-white';
  return (
    <div className="inline-flex rounded-lg p-0.5 text-sm font-semibold" role="group" aria-label="Language">
      {[
        ['bn', 'বাংলা'],
        ['en', 'English'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={lang === value}
          onClick={() => setLang(value)}
          className={`rounded-md px-2.5 py-1.5 ${lang === value ? on : base}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export function bnDigits(value) {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[d]);
}

/** 1st / ১ম, 2nd / ২য় … */
export function ordinalL(n, lang) {
  if (n === null || n === undefined) return '';
  if (lang !== 'bn') {
    const r = n % 100;
    if (r >= 11 && r <= 13) return `${n}th`;
    return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
  }
  const suffix = { 1: 'ম', 2: 'য়', 3: 'য়', 4: 'র্থ', 5: 'ম', 6: 'ষ্ঠ', 7: 'ম', 8: 'ম', 9: 'ম', 10: 'ম' }[n] || 'তম';
  return bnDigits(n) + suffix;
}
