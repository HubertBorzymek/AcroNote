import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

describe('uwierzytelnianie i izolacja danych',()=>{
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
