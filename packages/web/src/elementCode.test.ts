import { describe, expect, it } from 'vitest';
import { parseElementCode } from './elementCode';

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

  it.each(['121o', '800', '13000/', 'abc/'])('odrzuca nieprawidłowy kod %s', (code) => {
    expect(parseElementCode(code)).toBeNull();
  });
});
