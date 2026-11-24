import { describe, expect, it } from 'vitest';
import { checkElementCode, parseElementCode, twistDigitCounts, validateElementCode } from '@acronote/shared';

describe('kod elementu', () => {
  it.each([
    ['41o',4,1,0.5,'front','o'],
    ['42/',4,1,1,'back','/'],
    ['800<',8,2,0,'back','<'],
    ['801o',8,2,0.5,'front','o'],
    ['831/',8,2,2,'back','/'],
    ['12001<',12,3,0.5,'front','<'],
    ['12100/',12,3,0.5,'front','/']
  ] as const)('parsuje %s', (code,quarters,saltos,twists,direction,position) => {
    expect(parseElementCode(code)).toMatchObject({code,quarterCount:quarters,saltoCount:saltos,totalTwists:twists,direction,positionSymbol:position});
  });

  it.each(['41','41x','121o','8000o','013o','13000o','',null])('odrzuca niepełny lub niejednoznaczny kod %s', code => {
    expect(parseElementCode(code)).toBeNull();
  });

  it.each([['o','tuck'],['<','pike'],['/','straight'],['O','tuck'],[' / ','straight']] as const)('sam znak %s to skok bez salta i śruby', (code, position) => {
    expect(parseElementCode(code)).toMatchObject({code:code.trim().toLowerCase(),quarterCount:0,saltoCount:0,totalTwists:0,direction:null,position});
  });

  it.each(['4o','40','oo','o/','x'])('nie uznaje %s za poprawny kod', code => expect(parseElementCode(code)).toBeNull());

  it('przyjmuje kod spoza notacji tylko po potwierdzeniu', () => {
    expect(() => checkElementCode('4o', false)).toThrow(/nieprawidłowy/);
    expect(checkElementCode(' 4o ', true)).toEqual({code:'4o',parsed:null});
    expect(checkElementCode('41o', true).parsed).toMatchObject({code:'41o'});
    expect(() => checkElementCode('   ', true)).toThrow(/wymagany/);
    expect(() => checkElementCode('x'.repeat(21), true)).toThrow(/20 znaków/);
    expect(() => checkElementCode('4\u0000o', true)).toThrow(/niedozwolone/);
    expect(() => checkElementCode(42, true)).toThrow(/wymagany/);
  });

  it.each([
    ['70o', 7, 1, 0], ['700o', 7, 1, 0], ['71o', 7, 1, 0.5], ['710o', 7, 1, 0.5], ['701o', 7, 1, 0.5],
    ['50o', 5, 1, 0], ['500o', 5, 1, 0], ['51o', 5, 1, 0.5], ['510o', 5, 1, 0.5],
    ['30/', 3, 1, 0], ['901<', 9, 2, 0.5], ['9001<', 9, 2, 0.5], ['1100o', 11, 2, 0], ['11000o', 11, 2, 0],
  ] as const)('niepełne salta: %s przyjęte (cyfry na całe albo zaczęte salta)', (code, quarters, saltos, twists) => {
    expect(parseElementCode(code)).toMatchObject({ code, quarterCount: quarters, saltoCount: saltos, totalTwists: twists });
  });

  it.each(['7000o', '5000o', '9o', '30o0', '700'])('niepełne salta: odrzuca %s', (code) => expect(parseElementCode(code)).toBeNull());

  it('żaden ciąg cyfr nie pasuje na dwa sposoby', () => {
    let checked = 0; const ambiguous: string[] = [];
    for (let length = 2; length <= 6; length++) for (let n = 0; n < 10 ** length; n++) {
      const digits = String(n).padStart(length, '0');
      const readings = [1, 2].filter((prefix) => {
        if (digits.length <= prefix || digits[0] === '0') return false;
        const quarters = Number(digits.slice(0, prefix));
        return quarters >= 1 && quarters <= 12 && twistDigitCounts(quarters).includes(digits.length - prefix);
      });
      if (readings.length > 1) ambiguous.push(digits);
      checked++;
    }
    expect(ambiguous).toEqual([]);
    expect(checked).toBeGreaterThan(1_000_000);
  });

  it('zwraca czytelny błąd walidacji', () => expect(() => validateElementCode('121o')).toThrow(/pełnego kodu/));
});
