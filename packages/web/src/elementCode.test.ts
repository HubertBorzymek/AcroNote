import { describe, expect, it } from 'vitest';
import { describeElementCode, parseCatalogCode, parseElementCode, parseTumblingCode, standardElementName } from './elementCode';

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

  it.each([['70o', 1, 0], ['700o', 1, 0], ['51o', 1, 0.5], ['510o', 1, 0.5], ['901<', 2, 0.5], ['9001<', 2, 0.5]] as const)('niepełne salto %s (oba zapisy)', (code, somersaults, totalTwists) => {
    expect(parseElementCode(code)).toMatchObject({ somersaults, totalTwists });
  });

  it.each(['121o', '800', '13000/', 'abc/', '4o', 'oo', '7000o'])('odrzuca nieprawidłowy kod %s', (code) => {
    expect(parseElementCode(code)).toBeNull();
  });
});

describe('zapis ścieżkowy (web, ta sama logika co @acronote/shared)', () => {
  it.each([
    ['0o', 1, 0, 'Tył', 'Kuczna'],
    ['.0<', 1, 0, 'Przód', 'Łamana'],
    ['.1', 1, 0.5, 'Przód', null],
    ['1. /', 1, 0.5, 'Tył', 'Prosta'],
    ['0 0 /', 2, 0, 'Tył', 'Prosta'],
    ['22o', 2, 2, 'Tył', 'Kuczna'],
    ['0ox', 1, 0, 'Bok', 'Kuczna'],
    ['4o', 1, 2, 'Tył', 'Kuczna'],
    ['0000<', 4, 0, 'Tył', 'Łamana'],
  ] as const)('czyta %s', (code, somersaults, totalTwists, direction, positionName) => {
    expect(parseCatalogCode(code, 'tumbling')).toMatchObject({ somersaults, totalTwists, direction, positionName });
  });

  it.each(['0', '0.o', '.1.', '.0ox', '0x', '00000o', 'o', '00Y'])('odrzuca %s', (code) => {
    expect(parseTumblingCode(code)).toBeNull();
  });

  it('nazywa elementy bez salta i opisuje salta', () => {
    expect([['(', 'Rundak'], ['f', 'Flik'], ['H', 'Przerzut w przód'], ['x', 'Przerzut bokiem'], ['^', 'Tempo']].map(([code]) => standardElementName(code, 'tumbling'))).toEqual(['Rundak', 'Flik', 'Przerzut w przód', 'Przerzut bokiem', 'Tempo']);
    expect(describeElementCode('(', 'tumbling')).toBe('Rundak · element bez salta');
    expect(describeElementCode('00/', 'tumbling')).toBe('2 salta · 0 śruby · tył · prosta');
    expect(describeElementCode('2.', 'tumbling')).toBe('1 salto · 1 śruby · tył');
    // The same text means different things in the two notations.
    expect(describeElementCode('o', 'tumbling')).toBeNull();
    expect(standardElementName('o', 'trampoline')).toBe('Kuczka');
    expect(standardElementName('o')).toBe('Kuczka');
  });
});
