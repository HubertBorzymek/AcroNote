import bcrypt from 'bcryptjs';
import { openDatabase, seedExecutionTypes } from './db.js';
import { saveTraining } from './training-service.js';

const db=openDatabase();
try {
  if((db.prepare('SELECT COUNT(*) count FROM users').get() as any).count>0){console.log('Baza zawiera już użytkowników. Dane demonstracyjne nie zostały dodane.');process.exit(0);}
  const userId=Number(db.prepare('INSERT INTO users(username,password_hash,coach_enabled) VALUES(?,?,1)').run('demo',await bcrypt.hash('AcroNote-demo-2026',12)).lastInsertRowid);
  seedExecutionTypes(db,userId); const type=db.prepare("SELECT id FROM execution_types WHERE user_id=? AND name='Na płasko'").get(userId) as any;
  const a=Number(db.prepare("INSERT INTO elements(user_id,code,name,favorite) VALUES(?,'41o','Barani',1)").run(userId).lastInsertRowid);
  const b=Number(db.prepare("INSERT INTO elements(user_id,code,name) VALUES(?,'40/','Salto w tył')").run(userId).lastInsertRowid);
  const routine=Number(db.prepare("INSERT INTO routines(user_id,name,slot_count) VALUES(?,'Układ demonstracyjny',2)").run(userId).lastInsertRowid);
  const item=db.prepare('INSERT INTO routine_items(routine_id,position,element_id,code_snapshot,name_snapshot) VALUES(?,?,?,?,?)');item.run(routine,1,a,'41o','Barani');item.run(routine,2,b,'40/','Salto w tył');
  saveTraining(db,userId,{date:new Date().toISOString().slice(0,10),entries:[{defaultExecutionTypeId:type.id,defaultExecutionTypeName:'Na płasko',activities:[
    {kind:'element',sourceElementId:a,code:'41o',name:'Barani',repetitions:3,executionTypeId:type.id,executionTypeName:'Na płasko'},
    {kind:'routine',sourceRoutineId:routine,sourceRoutineName:'Układ demonstracyjny',sourceTemplateVersion:1,rangeStart:1,rangeEnd:2,isFullRange:true,repetitions:2,executionTypeId:type.id,executionTypeName:'Na płasko',elements:[
      {sourceElementId:a,code:'41o',name:'Barani',position:1,executionTypeId:type.id,executionTypeName:'Na płasko'},
      {sourceElementId:b,code:'40/',name:'Salto w tył',position:2,executionTypeId:type.id,executionTypeName:'Na płasko'}]}]}]});
  console.log('Dodano konto demo / AcroNote-demo-2026 i przykładowy trening.');
} finally {db.close();}
