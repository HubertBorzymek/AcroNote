import bcrypt from 'bcryptjs';
import { parseElementCode } from '@acronote/shared';
import { openDatabase, seedExecutionTypes, type Db } from './db.js';
import { saveTraining } from './training-service.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const DEMO_CREDENTIALS = { username: 'demo', password: 'AcroNote-demo-2026' } as const;
export const ADMIN_CREDENTIALS = { username: 'admin', password: 'AcroNote-admin-2026' } as const;

const demoElements = [
  ['40o','Salto w tył kuczne'],['41<','Pół śruby łamane'],['42/','Pełna śruba prosta'],['43o','Półtorej śruby kucznej'],
  ['44<','Dwie śruby łamane'],['45/','Dwie i pół śruby prostej'],['46o','Trzy śruby kuczne'],
  ['50/','Pięć ćwiartek bez śruby'],['51o','Pięć ćwiartek z półśrubą'],['52<','Pięć ćwiartek z pełną śrubą'],
  ['800o','Podwójne bez śrub'],['801<','Podwójne, pół śruby na końcu'],['810/','Podwójne, pół śruby na początku'],
  ['811o','Podwójne po pół śruby'],['820<','Podwójne z pełną śrubą na początku'],['802/','Podwójne z pełną śrubą na końcu'],
  ['831o','Podwójne: 1,5 i 0,5 śruby'],['813<','Podwójne: 0,5 i 1,5 śruby'],['822/','Podwójne: po jednej śrubie'],
  ['840o','Podwójne z dwiema śrubami na początku'],['900<','Dziewięć ćwiartek bez śrub'],['901/','Dziewięć ćwiartek z półśrubą'],
  ['910o','Dziewięć ćwiartek z półśrubą na początku'],['911<','Dziewięć ćwiartek po pół śruby'],
  ['12000/','Potrójne bez śrub'],['12001o','Potrójne z półśrubą na końcu'],['12010<','Potrójne z półśrubą w środku'],
  ['12100/','Potrójne z półśrubą na początku'],['12111o','Potrójne po pół śruby'],['12303<','Potrójne w mieszanej konfiguracji']
] as const;

export async function seedDemoAndAdmin(db: Db): Promise<{ demoCreated:boolean; adminCreated:boolean }> {
  let demoCreated=false;let adminCreated=false;
  let demo=db.prepare('SELECT id FROM users WHERE username=?').get(DEMO_CREDENTIALS.username) as {id:number}|undefined;
  if(!demo){const id=Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'user')").run(DEMO_CREDENTIALS.username,await bcrypt.hash(DEMO_CREDENTIALS.password,12)).lastInsertRowid);demo={id};demoCreated=true;seedExecutionTypes(db,id);seedDemoContent(db,id);}
  let admin=db.prepare('SELECT id FROM users WHERE username=?').get(ADMIN_CREDENTIALS.username) as {id:number}|undefined;
  if(!admin){const id=Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')").run(ADMIN_CREDENTIALS.username,await bcrypt.hash(ADMIN_CREDENTIALS.password,12)).lastInsertRowid);admin={id};adminCreated=true;seedExecutionTypes(db,id);}
  return {demoCreated,adminCreated};
}

function seedDemoContent(db:Db,userId:number):void {
  const insert=db.prepare(`INSERT INTO elements(user_id,code,name,favorite,quarter_count,salto_count,total_twist_halves,direction,position_symbol) VALUES(?,?,?,?,?,?,?,?,?)`);
  const ids:number[]=[];
  demoElements.forEach(([code,name],index)=>{const parsed=parseElementCode(code);if(!parsed)throw new Error(`Nieprawidłowy kod danych demo: ${code}`);ids.push(Number(insert.run(userId,code,name,index%7===0?1:0,parsed.quarterCount,parsed.saltoCount,parsed.totalTwistHalves,parsed.direction,parsed.positionSymbol).lastInsertRowid));});
  const routineInsert=db.prepare("INSERT INTO routines(user_id,name,slot_count) VALUES(?,?,?)");
  const routine1=Number(routineInsert.run(userId,'Układ 1',8).lastInsertRowid);const routine2=Number(routineInsert.run(userId,'Układ 2',8).lastInsertRowid);
  const item=db.prepare('INSERT INTO routine_items(routine_id,position,element_id,code_snapshot,name_snapshot) VALUES(?,?,?,?,?)');
  const first=[0,11,2,17,25,6,20,29];const second=[4,14,8,14,22,1,27,10];
  for(const [routine,indexes] of [[routine1,first],[routine2,second]] as const)indexes.forEach((elementIndex,position)=>item.run(routine,position+1,ids[elementIndex],demoElements[elementIndex]![0],demoElements[elementIndex]![1]));
  const type=db.prepare("SELECT id FROM execution_types WHERE user_id=? AND name='Siatka'").get(userId) as {id:number};
  const today=new Date();
  for(let day=35;day>=0;day-=7){const date=new Date(today);date.setUTCDate(date.getUTCDate()-day);const index=(day/7)%demoElements.length;const [code,name]=demoElements[index]!;saveTraining(db,userId,{date:date.toISOString().slice(0,10),entries:[{defaultExecutionTypeId:type.id,defaultExecutionTypeName:'Siatka',activities:[{kind:'element',sourceElementId:ids[index],code,name,repetitions:2+(day%5),executionTypeId:type.id,executionTypeName:'Siatka'}]}]});}
  const routineElements=first.map((index,position)=>({sourceElementId:ids[index],code:demoElements[index]![0],name:demoElements[index]![1],position:position+1,executionTypeId:type.id,executionTypeName:'Siatka'}));
  saveTraining(db,userId,{date:today.toISOString().slice(0,10),entries:[{defaultExecutionTypeId:type.id,defaultExecutionTypeName:'Siatka',activities:[{kind:'routine',sourceRoutineId:routine1,sourceRoutineName:'Układ 1',sourceTemplateVersion:1,rangeStart:1,rangeEnd:8,isFullRange:true,repetitions:3,executionTypeId:type.id,executionTypeName:'Siatka',elements:routineElements}]}]});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const db=openDatabase();
  try {
    const result=await seedDemoAndAdmin(db);
    console.log(`${result.demoCreated?'Utworzono':'Pozostawiono istniejące'} konto demo. Dane logowania dla nowego konta: ${DEMO_CREDENTIALS.username} / ${DEMO_CREDENTIALS.password}`);
    console.log(`${result.adminCreated?'Utworzono':'Pozostawiono istniejące'} konto admin. Dane logowania dla nowego konta: ${ADMIN_CREDENTIALS.username} / ${ADMIN_CREDENTIALS.password}`);
    if(!result.demoCreated||!result.adminCreated)console.log('Istniejących kont i ich haseł ani danych nie zmieniono.');
  } finally {db.close();}
}
