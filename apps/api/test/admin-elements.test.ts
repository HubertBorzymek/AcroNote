import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';
import { openDatabase, seedExecutionTypes, type Db } from '../src/db.js';
import { insertAdmin, loginAdmin } from './helpers.js';

describe('elementy i administracja', () => {
  let db:Db;let app:Awaited<ReturnType<typeof buildApp>>;let userCookie:string;let adminCookie:string;let userId:number;
  beforeEach(async()=>{
    db=openDatabase(':memory:');
    userId=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('user',?)").run(await bcrypt.hash('bezpieczne-haslo',4)).lastInsertRowid);seedExecutionTypes(db,userId);
    await insertAdmin(db,'admin','bezpieczne-admin');
    app=await buildApp({db});
    const user=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'user',password:'bezpieczne-haslo'}});userCookie=user.cookies[0]!.value;
    adminCookie=(await loginAdmin(app,'admin','bezpieczne-admin')).split('=')[1]!;
  });
  afterEach(async()=>{await app.close();db.close();});
  const auth=(cookie:string)=>({cookie:`acronote_session=${cookie}`});

  it('dodaje skoki o, <, / jako poprawne elementy',async()=>{
    for(const code of ['o','<','/']){const created=await app.inject({method:'POST',url:'/api/elements',headers:auth(userCookie),payload:{code}});expect(created.statusCode).toBe(201);expect(created.json()).toMatchObject({code,quarterCount:0,saltoCount:0,totalTwists:0,direction:null});}
    expect((await app.inject({method:'GET',url:'/api/elements?saltoCount=0&position=%3C',headers:auth(userCookie)})).json().map((e:any)=>e.code)).toEqual(['<']);
    expect((await app.inject({method:'GET',url:'/api/elements?direction=back',headers:auth(userCookie)})).json()).toEqual([]);
  });

  it('kod spoza notacji zapisuje się tylko po potwierdzeniu i bez wyliczonych pól',async()=>{
    const refused=await app.inject({method:'POST',url:'/api/elements',headers:auth(userCookie),payload:{code:'4o'}});expect(refused.statusCode).toBe(400);
    const created=await app.inject({method:'POST',url:'/api/elements',headers:auth(userCookie),payload:{code:' 4o ',name:'Coś',allowNonStandardCode:true}});expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({code:'4o',quarterCount:null,saltoCount:null,totalTwists:null,direction:null,positionSymbol:null});
    const id=created.json().id;
    expect(db.prepare('SELECT quarter_count,salto_count,total_twist_halves,direction,position_symbol FROM elements WHERE id=?').get(id)).toEqual({quarter_count:null,salto_count:null,total_twist_halves:null,direction:null,position_symbol:null});
    // Ten sam kod drugi raz: konflikt, nie duplikat.
    expect((await app.inject({method:'POST',url:'/api/elements',headers:auth(userCookie),payload:{code:'4o',allowNonStandardCode:true}})).statusCode).toBe(409);
    // Zmiana ulubionego bez zmiany kodu nie wymaga ponownego potwierdzenia.
    expect((await app.inject({method:'PUT',url:`/api/elements/${id}`,headers:auth(userCookie),payload:{code:'4o',favorite:true}})).statusCode).toBe(200);
    // Nowy kod spoza notacji wymaga potwierdzenia, poprawny już nie, i wtedy pola się wyliczają.
    expect((await app.inject({method:'PUT',url:`/api/elements/${id}`,headers:auth(userCookie),payload:{code:'40'}})).statusCode).toBe(400);
    expect((await app.inject({method:'PUT',url:`/api/elements/${id}`,headers:auth(userCookie),payload:{code:'40',allowNonStandardCode:true}})).statusCode).toBe(200);
    expect((await app.inject({method:'PUT',url:`/api/elements/${id}`,headers:auth(userCookie),payload:{code:'40o'}})).statusCode).toBe(200);
    expect(db.prepare('SELECT code,quarter_count,salto_count FROM elements WHERE id=?').get(id)).toEqual({code:'40o',quarter_count:4,salto_count:1});
  });

  it('nie pozwala edytować cudzego elementu kodem spoza notacji',async()=>{
    const other=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('inny',?)").run(await bcrypt.hash('bezpieczne-haslo',4)).lastInsertRowid);
    const foreign=Number(db.prepare("INSERT INTO elements(user_id,code) VALUES(?,'4o')").run(other).lastInsertRowid);
    expect((await app.inject({method:'PUT',url:`/api/elements/${foreign}`,headers:auth(userCookie),payload:{code:'4o'}})).statusCode).toBeGreaterThanOrEqual(400);
    expect(db.prepare('SELECT code,user_id FROM elements WHERE id=?').get(foreign)).toEqual({code:'4o',user_id:other});
  });

  it('waliduje, wylicza i filtruje kod oraz poprawnie obsługuje ukryte',async()=>{
    expect((await app.inject({method:'POST',url:'/api/elements',headers:auth(userCookie),payload:{code:'121o'}})).statusCode).toBe(400);
    const created=await app.inject({method:'POST',url:'/api/elements',headers:auth(userCookie),payload:{code:'831o',hidden:true}});expect(created.statusCode).toBe(201);expect(created.json()).toMatchObject({quarterCount:8,saltoCount:2,totalTwists:2,direction:'back'});
    expect((await app.inject({method:'GET',url:'/api/elements',headers:auth(userCookie)})).json()).toEqual([]);
    expect((await app.inject({method:'GET',url:'/api/elements?hidden=true&totalTwists=2&direction=back&position=o',headers:auth(userCookie)})).json()).toHaveLength(1);
  });

  it('zwraca użycie tylko dla aktywnych układów',async()=>{
    const element=(await app.inject({method:'POST',url:'/api/elements',headers:auth(userCookie),payload:{code:'40o'}})).json();
    expect((await app.inject({method:'GET',url:`/api/elements/${element.id}/usage`,headers:auth(userCookie)})).json()).toMatchObject({usedInRoutines:false,routineCount:0});
    await app.inject({method:'POST',url:'/api/routines',headers:auth(userCookie),payload:{name:'U1',items:[{elementId:element.id}]}});
    expect((await app.inject({method:'GET',url:`/api/elements/${element.id}/usage`,headers:auth(userCookie)})).json()).toMatchObject({usedInRoutines:true,routineCount:1});
  });

  it('nie daje zwykłemu użytkownikowi dostępu i nigdy nie zwraca hasha',async()=>{
    expect((await app.inject({method:'GET',url:'/api/admin/users',headers:auth(userCookie)})).statusCode).toBe(403);
    const response=await app.inject({method:'GET',url:'/api/admin/users?includeDeleted=true',headers:auth(adminCookie)});expect(response.statusCode).toBe(200);expect(response.body).not.toContain('password_hash');expect(response.body).not.toContain('token_hash');
  });

  it('nie pozwala administratorowi zakładać kont, ale pozwala zmienić nazwę ze spacją',async()=>{
    expect((await app.inject({method:'POST',url:'/api/admin/users',headers:auth(adminCookie),payload:{username:'Anna Nowak',password:'bezpieczne-haslo'}})).statusCode).toBe(404);
    const updated=await app.inject({method:'PUT',url:`/api/admin/users/${userId}`,headers:auth(adminCookie),payload:{username:'Anna Kowalska'}});
    expect(updated.statusCode).toBe(200);expect(updated.json().username).toBe('Anna Kowalska');
  });

  it('unieważnia sesje po soft-delete i pozwala przywrócić konto',async()=>{
    expect((await app.inject({method:'DELETE',url:`/api/admin/users/${userId}`,headers:auth(adminCookie)})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/api/auth/me',headers:auth(userCookie)})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:`/api/admin/users/${userId}/restore`,headers:auth(adminCookie)})).statusCode).toBe(200);
  });
});
