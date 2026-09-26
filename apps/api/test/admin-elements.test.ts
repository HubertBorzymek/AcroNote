import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';
import { openDatabase, seedExecutionTypes, type Db } from '../src/db.js';

describe('elementy i administracja', () => {
  let db:Db;let app:Awaited<ReturnType<typeof buildApp>>;let userCookie:string;let adminCookie:string;let userId:number;
  beforeEach(async()=>{
    db=openDatabase(':memory:');
    userId=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('user',?)").run(await bcrypt.hash('bezpieczne-haslo',4)).lastInsertRowid);seedExecutionTypes(db,userId);
    db.prepare("INSERT INTO users(username,password_hash,role) VALUES('admin',?,'admin')").run(await bcrypt.hash('bezpieczne-admin',4));
    app=await buildApp({db});
    const user=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'user',password:'bezpieczne-haslo'}});userCookie=user.cookies[0]!.value;
    const admin=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'admin',password:'bezpieczne-admin'}});adminCookie=admin.cookies[0]!.value;
  });
  afterEach(async()=>{await app.close();db.close();});
  const auth=(cookie:string)=>({cookie:`acronote_session=${cookie}`});

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

  it('pozwala administratorowi tworzyć i zmieniać nazwy kont zawierające spację',async()=>{
    const created=await app.inject({method:'POST',url:'/api/admin/users',headers:auth(adminCookie),payload:{username:'Anna Nowak',password:'bezpieczne-haslo'}});
    expect(created.statusCode).toBe(201);expect(created.json().username).toBe('Anna Nowak');
    const updated=await app.inject({method:'PUT',url:`/api/admin/users/${created.json().id}`,headers:auth(adminCookie),payload:{username:'Anna Kowalska'}});
    expect(updated.statusCode).toBe(200);expect(updated.json().username).toBe('Anna Kowalska');
  });

  it('unieważnia sesje po soft-delete i pozwala przywrócić konto',async()=>{
    expect((await app.inject({method:'DELETE',url:`/api/admin/users/${userId}`,headers:auth(adminCookie)})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/api/auth/me',headers:auth(userCookie)})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url:`/api/admin/users/${userId}/restore`,headers:auth(adminCookie)})).statusCode).toBe(200);
  });
});
