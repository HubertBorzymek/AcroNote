import { describe, expect, it } from 'vitest';
import { checkElementCode, parseElementCode, validateElementCode } from '@acronote/shared';

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

  it('zwraca czytelny błąd walidacji', () => expect(() => validateElementCode('121o')).toThrow(/pełnego kodu/));
});
