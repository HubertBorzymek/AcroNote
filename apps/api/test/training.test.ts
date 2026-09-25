import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, seedExecutionTypes, type Db } from '../src/db.js';
import { getTraining, saveTraining, trainingSummary } from '../src/training-service.js';

describe('historyczne zapisy treningów', () => {
  let db: Db; let userId: number; let typeId: number; let elementA: number; let elementB: number; let routineId: number;
  beforeEach(() => {
    db=openDatabase(':memory:');
    userId=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('ala','hash')").run().lastInsertRowid); seedExecutionTypes(db,userId);
    typeId=(db.prepare("SELECT id FROM execution_types WHERE user_id=? AND name='Na płasko'").get(userId) as any).id;
    elementA=Number(db.prepare("INSERT INTO elements(user_id,code,name) VALUES(?, '41o','Barani')").run(userId).lastInsertRowid);
    elementB=Number(db.prepare("INSERT INTO elements(user_id,code,name) VALUES(?, '40/','Salto')").run(userId).lastInsertRowid);
    routineId=Number(db.prepare("INSERT INTO routines(user_id,name,slot_count) VALUES(?,'Układ 1',3)").run(userId).lastInsertRowid);
    const add=db.prepare('INSERT INTO routine_items(routine_id,position,element_id,code_snapshot,name_snapshot) VALUES(?,?,?,?,?)');
    add.run(routineId,1,elementA,'41o','Barani'); add.run(routineId,2,elementB,'40/','Salto'); add.run(routineId,3,elementA,'41o','Barani');
  });
  afterEach(()=>db.close());

  const fullActivity=()=>({kind:'routine' as const,repetitions:2,executionTypeId:typeId,executionTypeName:'Na płasko',sourceRoutineId:routineId,sourceRoutineName:'Układ 1',sourceTemplateVersion:1,rangeStart:1,rangeEnd:3,isFullRange:true,elements:[
    {sourceElementId:elementA,code:'41o',name:'Barani',executionTypeId:typeId,executionTypeName:'Na płasko',position:1},
    {sourceElementId:elementB,code:'40/',name:'Salto',executionTypeId:typeId,executionTypeName:'Na płasko',position:2},
    {sourceElementId:elementA,code:'41o',name:'Barani',executionTypeId:typeId,executionTypeName:'Na płasko',position:3}
  ]});

  it('zapisuje pojedyncze i różne elementy z liczbą powtórzeń',()=>{
    const id=saveTraining(db,userId,{date:'2026-09-25',entries:[{defaultExecutionTypeId:typeId,defaultExecutionTypeName:'Na płasko',activities:[
      {kind:'element',sourceElementId:elementA,code:'41o',name:'Barani',repetitions:3,executionTypeName:'Na płasko'},
      {kind:'element',sourceElementId:elementB,code:'40/',name:'Salto',repetitions:5,executionTypeName:'Materac'}]}]});
    const saved=getTraining(db,userId,id)!; expect(saved.entries[0].activities.map((x:any)=>x.repetitions)).toEqual([3,5]);
    expect(trainingSummary(db,userId).byCode).toEqual({'41o':3,'40/':5});
  });

  it('liczy pełny układ, fragmenty, powtórzenia i duplikaty bez podwójnego liczenia',()=>{
    saveTraining(db,userId,{date:'2026-09-25',entries:[{defaultExecutionTypeName:'Na płasko',activities:[fullActivity(),
      {...fullActivity(),repetitions:3,isFullRange:false,rangeStart:1,rangeEnd:2,elements:fullActivity().elements.slice(0,2)}]}]});
    const stats=trainingSummary(db,userId); expect(stats.totalElements).toBe(12); expect(stats.byCode).toEqual({'41o':7,'40/':5}); expect(stats.fullRoutines).toBe(2); expect(stats.fragments).toBe(3);
  });

  it('zachowuje migawkę po zmianie szablonu, kodu, typu i usunięciu źródeł',()=>{
    const id=saveTraining(db,userId,{date:'2026-09-25',entries:[{defaultExecutionTypeName:'Na płasko',activities:[fullActivity()]}]});
    db.prepare("UPDATE elements SET code='NOWY',name='Nowa nazwa',deleted_at=CURRENT_TIMESTAMP WHERE id=?").run(elementA);
    db.prepare("UPDATE execution_types SET name='Zmieniony',deleted_at=CURRENT_TIMESTAMP WHERE id=?").run(typeId);
    db.prepare('DELETE FROM routine_items WHERE routine_id=? AND position=3').run(routineId); db.prepare("UPDATE routines SET name='Inny',template_version=2 WHERE id=?").run(routineId);
    const saved=getTraining(db,userId,id)!; expect(saved.entries[0].activities[0].elements.map((x:any)=>x.code)).toEqual(['41o','40/','41o']);
    expect(saved.entries[0].activities[0].sourceRoutineName).toBe('Układ 1'); expect(saved.entries[0].activities[0].elements[0].executionTypeName).toBe('Na płasko');
    expect(trainingSummary(db,userId).byCode['41o']).toBe(4);
  });

  it('edycja starego treningu przelicza wyłącznie jego statystyki',()=>{
    const first=saveTraining(db,userId,{date:'2026-09-25',entries:[{defaultExecutionTypeName:'Na płasko',activities:[{kind:'element',code:'41o',repetitions:2,executionTypeName:'Na płasko'}]}]});
    saveTraining(db,userId,{date:'2026-09-26',entries:[{defaultExecutionTypeName:'Na płasko',activities:[{kind:'element',code:'41o',repetitions:4,executionTypeName:'Na płasko'}]}]});
    saveTraining(db,userId,{date:'2026-09-25',entries:[{defaultExecutionTypeName:'Na płasko',activities:[{kind:'element',code:'40/',repetitions:3,executionTypeName:'Gąbki'}]}]},first);
    expect(trainingSummary(db,userId).byCode).toEqual({'40/':3,'41o':4}); expect(trainingSummary(db,userId,'2026-09-25','2026-09-25').byCode).toEqual({'40/':3});
  });

  it('sumuje kilka treningów tego samego dnia oraz zakres tygodniowy i miesięczny',()=>{
    for(const [date,count] of [['2026-09-21',2],['2026-09-21',3],['2026-10-01',7]] as const) saveTraining(db,userId,{date,entries:[{defaultExecutionTypeName:'Na płasko',activities:[{kind:'element',code:'41o',repetitions:count,executionTypeName:'Na płasko'}]}]});
    expect(trainingSummary(db,userId,'2026-09-21','2026-09-21')).toMatchObject({trainings:2,totalElements:5});
    expect(trainingSummary(db,userId,'2026-09-21','2026-09-27').totalElements).toBe(5); expect(trainingSummary(db,userId,'2026-09-01','2026-09-30').totalElements).toBe(5);
  });

  it('odrzuca zero powtórzeń',()=>{expect(()=>saveTraining(db,userId,{date:'2026-09-25',entries:[{defaultExecutionTypeName:'Na płasko',activities:[{kind:'element',code:'41o',repetitions:0,executionTypeName:'Na płasko'}]}]})).toThrow(/powtórzeń/);});
});
