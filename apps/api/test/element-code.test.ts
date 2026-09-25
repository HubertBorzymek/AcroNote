import { describe, expect, it } from 'vitest';
import { parseElementCode, validateElementCode } from '@acronote/shared';

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

  it('zwraca czytelny błąd walidacji', () => expect(() => validateElementCode('121o')).toThrow(/pełnego kodu/));
});
