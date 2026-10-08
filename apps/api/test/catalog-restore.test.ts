import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';
import { openDatabase, seedExecutionTypes, type Db } from '../src/db.js';

describe('ponowne dodawanie usuniętych pozycji katalogu', () => {
  let db:Db;let app:Awaited<ReturnType<typeof buildApp>>;let cookie:string;
  beforeEach(async()=>{
    db=openDatabase(':memory:');
    const userId=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('user',?)").run(await bcrypt.hash('bezpieczne-haslo',4)).lastInsertRowid);seedExecutionTypes(db,userId);
    app=await buildApp({db});
    cookie=(await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'user',password:'bezpieczne-haslo'}})).cookies[0]!.value;
  });
  afterEach(async()=>{await app.close();db.close();});
  const headers=()=>({cookie:`acronote_session=${cookie}`});

  it('przywraca usunięty element przy ponownym dodaniu tego samego kodu',async()=>{
    const first=(await app.inject({method:'POST',url:'/api/elements',headers:headers(),payload:{code:'40o',name:'Stare'}})).json();
    expect((await app.inject({method:'DELETE',url:`/api/elements/${first.id}`,headers:headers()})).statusCode).toBe(200);
    const again=await app.inject({method:'POST',url:'/api/elements',headers:headers(),payload:{code:'40o',name:'Nowe'}});
    expect(again.statusCode).toBe(201);expect(again.json()).toMatchObject({id:first.id,name:'Nowe'});
    expect((await app.inject({method:'GET',url:'/api/elements',headers:headers()})).json()).toHaveLength(1);
    expect((await app.inject({method:'POST',url:'/api/elements',headers:headers(),payload:{code:'40o'}})).statusCode).toBe(409);
  });

  it('zwraca czytelny konflikt przy zmianie kodu na zajęty',async()=>{
    await app.inject({method:'POST',url:'/api/elements',headers:headers(),payload:{code:'40o'}});
    const other=(await app.inject({method:'POST',url:'/api/elements',headers:headers(),payload:{code:'41o'}})).json();
    const response=await app.inject({method:'PUT',url:`/api/elements/${other.id}`,headers:headers(),payload:{code:'40o'}});
    expect(response.statusCode).toBe(409);expect(response.json().message).toBe('Element o tym kodzie już istnieje.');
  });

  it('przywraca usunięte miejsce lądowania i odrzuca duplikat nazwy',async()=>{
    const types=(await app.inject({method:'GET',url:'/api/execution-types',headers:headers()})).json() as {id:number;name:string}[];
    const mat=types.find(type=>type.name==='Materac')!;
    expect((await app.inject({method:'POST',url:'/api/execution-types',headers:headers(),payload:{name:'Materac'}})).statusCode).toBe(409);
    await app.inject({method:'DELETE',url:`/api/execution-types/${mat.id}`,headers:headers()});
    const again=await app.inject({method:'POST',url:'/api/execution-types',headers:headers(),payload:{name:'Materac'}});
    expect(again.statusCode).toBe(201);expect(again.json().id).toBe(mat.id);
    const siatka=types.find(type=>type.name==='Siatka')!;
    const rename=await app.inject({method:'PUT',url:`/api/execution-types/${siatka.id}`,headers:headers(),payload:{name:'Materac'}});
    expect(rename.statusCode).toBe(409);
  });

  it('pozwala edytować układ z odłączonym (usuniętym) elementem',async()=>{
    const a=(await app.inject({method:'POST',url:'/api/elements',headers:headers(),payload:{code:'40o'}})).json();
    const b=(await app.inject({method:'POST',url:'/api/elements',headers:headers(),payload:{code:'41o'}})).json();
    const routine=(await app.inject({method:'POST',url:'/api/routines',headers:headers(),payload:{name:'U1',items:[{elementId:a.id},{elementId:b.id}]}})).json();
    await app.inject({method:'DELETE',url:`/api/elements/${a.id}?routineHandling=keep`,headers:headers()});
    const current=(await app.inject({method:'GET',url:`/api/routines/${routine.id}`,headers:headers()})).json();
    expect(current.items[0]).toMatchObject({elementId:null,code:'40o'});
    const items=current.items.map((item:any)=>({elementId:item.elementId,code:item.code,name:item.name}));
    const saved=await app.inject({method:'PUT',url:`/api/routines/${routine.id}`,headers:headers(),payload:{name:'U1 po zmianie',items:items.reverse()}});
    expect(saved.statusCode).toBe(200);expect(saved.json().items.map((item:any)=>item.code)).toEqual(['41o','40o']);
  });

  it('odrzuca nieistniejącą datę treningu',async()=>{
    const response=await app.inject({method:'POST',url:'/api/trainings',headers:headers(),payload:{date:'2026-02-30',entries:[]}});
    expect(response.statusCode).toBe(400);expect(response.json().message).toBe('Nieprawidłowa data treningu.');
    expect((await app.inject({method:'POST',url:'/api/trainings',headers:headers(),payload:{date:'2026-13-45',entries:[]}})).json().message).toBe('Nieprawidłowa data treningu.');
  });
});
