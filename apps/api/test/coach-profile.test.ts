import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

const password = 'bardzo-bezpieczne-haslo';
const cookie = (response: any) => `acronote_session=${response.cookies[0]!.value}`;

describe('profil trenera i zgody na udostępnienie historii', () => {
  it('łączy konta po dwóch świadomych działaniach i udostępnia trenerowi pełny odczyt', async () => {
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    const athleteResponse=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'zawodnik',password}});
    const coachResponse=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'trener',password}});
    const strangerResponse=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'obcy_trener',password}});
    const athleteCookie=cookie(athleteResponse); const coachCookie=cookie(coachResponse); const strangerCookie=cookie(strangerResponse);
    const athleteId=athleteResponse.json().id;
    await app.inject({method:'PUT',url:'/api/profile',headers:{cookie:coachCookie},payload:{athleteEnabled:true,coachEnabled:true}});
    await app.inject({method:'PUT',url:'/api/profile',headers:{cookie:strangerCookie},payload:{athleteEnabled:true,coachEnabled:true}});

    const first=await app.inject({method:'POST',url:'/api/elements',headers:{cookie:athleteCookie},payload:{code:'41o',name:'Pojedyncze'}});
    const second=await app.inject({method:'POST',url:'/api/elements',headers:{cookie:athleteCookie},payload:{code:'800o',name:'Podwójne'}});
    const firstId=first.json().id; const secondId=second.json().id;
    await app.inject({method:'POST',url:'/api/routines',headers:{cookie:athleteCookie},payload:{name:'Wejście',slotCount:2,items:[{elementId:firstId},{elementId:secondId}]}});
    const training=await app.inject({method:'POST',url:'/api/trainings',headers:{cookie:athleteCookie},payload:{date:'2026-09-25',entries:[{defaultExecutionTypeName:'Siatka',activities:[{
      kind:'routine',sourceRoutineId:null,sourceRoutineName:'41o + 800o',rangeStart:1,rangeEnd:2,isFullRange:true,repetitions:1,executionTypeName:'Siatka',elements:[
        {sourceElementId:firstId,code:'41o',position:1,executionTypeName:'Siatka'},
        {sourceElementId:secondId,code:'800o',position:2,executionTypeName:'Materac'}
      ]}]}]}});
    expect(training.statusCode).toBe(201);

    expect((await app.inject({method:'GET',url:`/api/coach/athletes/${athleteId}/trainings`,headers:{cookie:coachCookie}})).statusCode).toBe(403);
    expect((await app.inject({method:'GET',url:`/api/coach/athletes/${athleteId}/elements`,headers:{cookie:strangerCookie}})).statusCode).toBe(403);

    const invitation=await app.inject({method:'POST',url:'/api/coach/invitations',headers:{cookie:athleteCookie},payload:{role:'athlete',expiresInHours:2}});
    expect(invitation.statusCode).toBe(201);
    expect(invitation.json()).toMatchObject({role:'athlete',status:'pending',expiresInHours:2});
    const preview=await app.inject({method:'GET',url:`/api/coach/invitations/preview?credential=${invitation.json().shortCode.toLowerCase()}`,headers:{cookie:coachCookie}});
    expect(preview.json()).toMatchObject({creatorUsername:'zawodnik',requiredProfile:'coach'});
    expect((await app.inject({method:'GET',url:'/api/coach/invitations',headers:{cookie:athleteCookie}})).json()[0]).not.toHaveProperty('token');

    const accepted=await app.inject({method:'POST',url:'/api/coach/invitations/accept',headers:{cookie:coachCookie},payload:{token:invitation.json().token}});
    expect(accepted.statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/api/coach/athletes',headers:{cookie:coachCookie}})).json()).toMatchObject([{id:athleteId,username:'zawodnik'}]);
    expect((await app.inject({method:'GET',url:'/api/athlete/coaches',headers:{cookie:athleteCookie}})).json()).toMatchObject([{username:'trener'}]);

    for (const path of ['','/elements','/execution-types','/routines','/trainings',`/trainings/${training.json().id}`,'/stats',`/elements/${firstId}/history`]) {
      const response=await app.inject({method:'GET',url:`/api/coach/athletes/${athleteId}${path}`,headers:{cookie:coachCookie}});
      expect(response.statusCode, path).toBe(200);
    }
    const stats=(await app.inject({method:'GET',url:`/api/coach/athletes/${athleteId}/stats`,headers:{cookie:coachCookie}})).json();
    expect(stats.byLanding).toEqual([{name:'Materac',count:1},{name:'Siatka',count:1}]);
    expect(stats.landingByCode).toEqual([
      {code:'41o',landings:[{name:'Siatka',count:1}]},
      {code:'800o',landings:[{name:'Materac',count:1}]}
    ]);
    expect((await app.inject({method:'GET',url:`/api/coach/athletes/${athleteId}/elements/${secondId}/history`,headers:{cookie:coachCookie}})).json()).toEqual([
      {trainingId:training.json().id,date:'2026-09-25',count:1,landings:[{name:'Materac',count:1}]}
    ]);

    const edit=await app.inject({method:'PUT',url:`/api/coach/athletes/${athleteId}/trainings/${training.json().id}`,headers:{cookie:coachCookie},payload:{date:'2026-09-26',entries:[]}});
    expect(edit.statusCode).toBe(404);
    const ownerRouteEdit=await app.inject({method:'PUT',url:`/api/trainings/${training.json().id}`,headers:{cookie:coachCookie},payload:{date:'2026-09-26',entries:[]}});
    expect(ownerRouteEdit.statusCode).toBe(404);

    expect((await app.inject({method:'DELETE',url:`/api/coach/links/${athleteId}`,headers:{cookie:coachCookie}})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:`/api/coach/athletes/${athleteId}/stats`,headers:{cookie:coachCookie}})).statusCode).toBe(403);
    await app.close();db.close();
  });

  it('wymaga jawnej zgody zawodnika na zaproszenie trenera oraz pozwala anulować i wygasza zaproszenia', async () => {
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    const athlete=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'zawodniczka',password}}); const athleteCookie=cookie(athlete);
    const coach=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'trenerka',password}}); const coachCookie=cookie(coach);
    await app.inject({method:'PUT',url:'/api/profile',headers:{cookie:coachCookie},payload:{athleteEnabled:true,coachEnabled:true}});

    const created=await app.inject({method:'POST',url:'/api/coach/invitations',headers:{cookie:coachCookie},payload:{role:'coach'}});
    expect((await app.inject({method:'POST',url:'/api/coach/invitations/accept',headers:{cookie:coachCookie},payload:{token:created.json().token}})).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:'/api/coach/invitations/accept',headers:{cookie:athleteCookie},payload:{shortCode:created.json().shortCode}})).statusCode).toBe(200);
    expect((await app.inject({method:'DELETE',url:`/api/athlete/coaches/${coach.json().id}`,headers:{cookie:athleteCookie}})).statusCode).toBe(200);

    const cancelled=await app.inject({method:'POST',url:'/api/coach/invitations',headers:{cookie:coachCookie},payload:{role:'coach'}});
    expect((await app.inject({method:'DELETE',url:`/api/coach/invitations/${cancelled.json().id}`,headers:{cookie:coachCookie}})).statusCode).toBe(200);
    expect((await app.inject({method:'POST',url:'/api/coach/invitations/accept',headers:{cookie:athleteCookie},payload:{token:cancelled.json().token}})).statusCode).toBe(404);

    const expired=await app.inject({method:'POST',url:'/api/coach/invitations',headers:{cookie:coachCookie},payload:{role:'coach'}});
    db.prepare("UPDATE invitations SET expires_at=datetime('now','-1 minute') WHERE id=?").run(expired.json().id);
    expect((await app.inject({method:'POST',url:'/api/coach/invitations/accept',headers:{cookie:athleteCookie},payload:{token:expired.json().token}})).statusCode).toBe(404);
    expect((await app.inject({method:'GET',url:'/api/coach/invitations',headers:{cookie:coachCookie}})).json().map((x:any)=>x.status)).toEqual(['expired','cancelled','accepted']);
    await app.close();db.close();
  });

  it('natychmiast odbiera dostęp po wyłączeniu profilu trenera', async () => {
    const db=openDatabase(':memory:'); const app=await buildApp({db});
    const athlete=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'athlete_profile',password}});const athleteCookie=cookie(athlete);
    const coach=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'coach_profile',password}});const coachCookie=cookie(coach);
    await app.inject({method:'PUT',url:'/api/profile',headers:{cookie:coachCookie},payload:{athleteEnabled:true,coachEnabled:true}});
    const invitation=await app.inject({method:'POST',url:'/api/coach/invitations',headers:{cookie:athleteCookie},payload:{role:'athlete'}});
    await app.inject({method:'POST',url:'/api/coach/invitations/accept',headers:{cookie:coachCookie},payload:{token:invitation.json().token}});
    await app.inject({method:'PUT',url:'/api/profile',headers:{cookie:coachCookie},payload:{athleteEnabled:true,coachEnabled:false}});
    expect((await app.inject({method:'GET',url:`/api/coach/athletes/${athlete.json().id}/trainings`,headers:{cookie:coachCookie}})).statusCode).toBe(403);
    await app.close();db.close();
  });
});
