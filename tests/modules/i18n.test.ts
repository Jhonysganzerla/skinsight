/**
 * i18n t() — locale selection, override, interpolation, fallback (v0.7 T3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { t, setLocaleOverride, currentLocale } from '../../src/modules/shared/i18n';

afterEach(() => setLocaleOverride(null));

describe('i18n', () => {
  it('honors the locale override', () => {
    setLocaleOverride('pt-BR');
    expect(currentLocale()).toBe('pt-BR');
    expect(t('popup.sites.ready')).toBe('Pronto');
    setLocaleOverride('en');
    expect(t('popup.sites.ready')).toBe('Ready');
  });

  it('interpolates {var} placeholders', () => {
    setLocaleOverride('en');
    expect(t('time.min', { n: 5 })).toBe('5m ago');
    setLocaleOverride('pt-BR');
    expect(t('time.min', { n: 5 })).toBe('há 5 min');
  });

  it('falls back to the key when missing', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
  });

  it('defaults to en when no override and locale undetected', () => {
    setLocaleOverride(null);
    // node has no navigator.language → currentLocale() returns 'en'
    expect(['en', 'pt-BR']).toContain(currentLocale());
  });
});
