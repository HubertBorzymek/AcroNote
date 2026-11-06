import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

describe('uwierzytelnianie i izolacja danych',()=>{
  it('pozwala użyć imienia i nazwiska ze spacją, ale odrzuca znaki nowej linii',async()=>{
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    const registered=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'  Łukasz\u00a0 Żółć  ',password:'bardzo-bezpieczne-haslo'}});
    expect(registered.statusCode).toBe(201);
    expect(registered.json().username).toBe('Łukasz Żółć');
    const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'Łukasz Żo\u0301łć',password:'bardzo-bezpieczne-haslo'}});
    expect(login.statusCode).toBe(200);
    expect(login.json().username).toBe('Łukasz Żółć');
    const invalid=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'Maria\nKowalska',password:'bardzo-bezpieczne-haslo'}});
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().message).toBe('Nazwa użytkownika zawiera niedozwolone znaki.');
    await app.close();db.close();
  });
  it('za proxy ustawia cookie Secure, a link zaproszenia dostaje https',async()=>{
    const db=openDatabase(':memory:'); const app=await buildApp({db,behindProxy:true});
    const headers={'x-forwarded-proto':'https',host:'acronote.example.pl'};
    const registered=await app.inject({method:'POST',url:'/api/auth/register',headers,payload:{username:'za_proxy',password:'bardzo-bezpieczne-haslo'}});
    const session=registered.cookies[0]!;
    expect(session.secure).toBe(true);
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe('Strict');
    const invitation=await app.inject({method:'POST',url:'/api/coach/invitations',headers:{...headers,cookie:`acronote_session=${session.value}`},payload:{role:'athlete'}});
    expect(invitation.json().url).toMatch(/^https:\/\/acronote\.example\.pl\/zaproszenie\//);
    await app.close();db.close();
  });
  it('lokalnie po HTTP nie ufa nagłówkom proxy i nie ustawia cookie Secure',async()=>{
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    const registered=await app.inject({method:'POST',url:'/api/auth/register',headers:{'x-forwarded-proto':'https'},payload:{username:'lokalny',password:'bardzo-bezpieczne-haslo'}});
    expect(registered.cookies[0]!.secure).toBeUndefined();
    await app.close();db.close();
  });
  it('za proxy liczy limit osobno dla klienta i nie daje go obejść przez X-Forwarded-For',async()=>{
    const db=openDatabase(':memory:'); const app=await buildApp({db,behindProxy:true});
    const login=(headers:Record<string,string>)=>app.inject({method:'POST',url:'/api/auth/login',headers,payload:{username:'nieznany',password:'zle-haslo'}});
    for(let index=0;index<15;index++)expect((await login({'fly-client-ip':'203.0.113.1','x-forwarded-for':`198.51.100.${index}`})).statusCode).toBe(401);
    expect((await login({'fly-client-ip':'203.0.113.1','x-forwarded-for':'198.51.100.99'})).statusCode).toBe(429);
    expect((await login({'fly-client-ip':'203.0.113.2'})).statusCode).toBe(401);
    await app.close();db.close();
  });
  it('bez proxy ignoruje nagłówek Fly-Client-IP przy limitach',async()=>{
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    const login=(ip:string)=>app.inject({method:'POST',url:'/api/auth/login',headers:{'fly-client-ip':ip},payload:{username:'nieznany',password:'zle-haslo'}});
    for(let index=0;index<15;index++)expect((await login(`203.0.113.${index}`)).statusCode).toBe(401);
    expect((await login('203.0.113.99')).statusCode).toBe(429);
    await app.close();db.close();
  });
  it('ogranicza serię rejestracji na pięć minut i zwraca polski komunikat',async()=>{
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    for(let index=0;index<10;index++){
      const response=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:`limit_${index}`,password:'bardzo-bezpieczne-haslo'}});
      expect(response.statusCode).toBe(201);
    }
    const limited=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'limit_ostatni',password:'bardzo-bezpieczne-haslo'}});
    expect(limited.statusCode).toBe(429);
    expect(limited.json().message).toMatch(/^Zbyt wiele prób\. Spróbuj ponownie za [1-5] min\.$/);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(300);
    await app.close();db.close();
  });
  it('nie udostępnia danych bez sesji ani innemu użytkownikowi',async()=>{
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    const noAuth=await app.inject({method:'GET',url:'/api/elements'}); expect(noAuth.statusCode).toBe(401);
    const a=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'user_a',password:'bardzo-bezpieczne-a'}}); const cookieA=a.cookies[0]!.value;
    await app.inject({method:'POST',url:'/api/elements',headers:{cookie:`acronote_session=${cookieA}`},payload:{code:'41o'}});
    const b=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'user_b',password:'bardzo-bezpieczne-b'}}); const cookieB=b.cookies[0]!.value;
    const list=await app.inject({method:'GET',url:'/api/elements',headers:{cookie:`acronote_session=${cookieB}`}}); expect(list.json()).toEqual([]);
    await app.close(); db.close();
  });
  it('trener widzi dane dopiero po zaakceptowanym połączeniu i nie może ich edytować jako zawodnik',async()=>{
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    const athlete=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'athlete',password:'bardzo-bezpieczne-a'}});const athleteCookie=athlete.cookies[0]!.value;
    const coach=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'coach',password:'bardzo-bezpieczne-b'}});const coachCookie=coach.cookies[0]!.value;
    await app.inject({method:'PUT',url:'/api/profile',headers:{cookie:`acronote_session=${coachCookie}`},payload:{athleteEnabled:true,coachEnabled:true}});
    const athleteId=athlete.json().id;
    expect((await app.inject({method:'GET',url:`/api/coach/athletes/${athleteId}/trainings`,headers:{cookie:`acronote_session=${coachCookie}`}})).statusCode).toBe(403);
    const invitation=await app.inject({method:'POST',url:'/api/coach/invitations',headers:{cookie:`acronote_session=${athleteCookie}`},payload:{role:'athlete'}});
    expect(invitation.statusCode).toBe(201);
    const accepted=await app.inject({method:'POST',url:'/api/coach/invitations/accept',headers:{cookie:`acronote_session=${coachCookie}`},payload:{token:invitation.json().token}});expect(accepted.statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:`/api/coach/athletes/${athleteId}/trainings`,headers:{cookie:`acronote_session=${coachCookie}`}})).statusCode).toBe(200);
    const foreignEdit=await app.inject({method:'PUT',url:'/api/trainings/999',headers:{cookie:`acronote_session=${coachCookie}`},payload:{date:'2026-09-25',entries:[]}});expect(foreignEdit.statusCode).toBe(404);
    await app.close();db.close();
  });
});
