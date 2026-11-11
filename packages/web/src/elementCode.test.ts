import { describe, expect, it } from 'vitest';
import { describeElementCode, parseElementCode, standardElementName } from './elementCode';

describe('parseElementCode', () => {
  it.each([
    ['41o', 1, 0.5, 'Przód', 'Kuczna'],
    ['800/', 2, 0, 'Tył', 'Prosta'],
    ['831<', 2, 2, 'Tył', 'Łamana'],
    ['833o', 2, 3, 'Tył', 'Kuczna'],
    ['12001/', 3, 0.5, 'Przód', 'Prosta'],
    ['12100o', 3, 0.5, 'Przód', 'Kuczna'],
    ['50/', 1, 0, 'Tył', 'Prosta'],
    ['900<', 2, 0, 'Tył', 'Łamana'],
  ] as const)('czyta %s', (code, somersaults, totalTwists, direction, positionName) => {
    expect(parseElementCode(code)).toMatchObject({ somersaults, totalTwists, direction, positionName });
  });

  it.each([['o', 'Kuczna', 'Kuczka'], ['<', 'Łamana', 'Rozkroczka'], ['/', 'Prosta', 'Poziomka']] as const)('sam znak %s to element bez salta', (code, positionName, name) => {
    expect(parseElementCode(code)).toMatchObject({ somersaults: 0, totalTwists: 0, direction: null, positionName });
    expect(standardElementName(code)).toBe(name);
    expect(describeElementCode(code)).toBe(`${name} · element bez salta`);
  });

  it('nazwę zwyczajową mają tylko elementy bez salta', () => {
    expect(standardElementName('40o')).toBeNull();
    expect(standardElementName('4o')).toBeNull();
  });

  it('opisuje poprawny kod i nie opisuje kodu spoza notacji', () => {
    expect(describeElementCode('831<')).toBe('2 salta · 2 śruby · tył · łamana');
    expect(describeElementCode('4o')).toBeNull();
    expect(describeElementCode('40')).toBeNull();
  });

  it.each(['121o', '800', '13000/', 'abc/', '4o', 'oo'])('odrzuca nieprawidłowy kod %s', (code) => {
    expect(parseElementCode(code)).toBeNull();
  });
});
