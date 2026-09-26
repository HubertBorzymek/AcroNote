import bcrypt from 'bcryptjs';
import { parseElementCode } from '@acronote/shared';
import { openDatabase, seedExecutionTypes, type Db } from './db.js';
import { saveTraining } from './training-service.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const DEMO_CREDENTIALS = { username: 'demo', password: 'AcroNote-demo-2026' } as const;
export const COACH_DEMO_CREDENTIALS = { username: 'trener_demo', password: 'AcroNote-trener-2026' } as const;
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

export async function seedDemoAndAdmin(db: Db): Promise<{ demoCreated:boolean; demoShowcaseCreated:boolean; coachDemoCreated:boolean; coachLinkCreated:boolean; adminCreated:boolean }> {
  let demoCreated=false;let coachDemoCreated=false;let adminCreated=false;
  let demo=db.prepare('SELECT id FROM users WHERE username=?').get(DEMO_CREDENTIALS.username) as {id:number}|undefined;
  if(!demo){const id=Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'user')").run(DEMO_CREDENTIALS.username,await bcrypt.hash(DEMO_CREDENTIALS.password,12)).lastInsertRowid);demo={id};demoCreated=true;seedExecutionTypes(db,id);seedDemoContent(db,id);}
  const demoShowcaseCreated=ensureDemoShowcaseTraining(db,demo.id);
  let coachDemo=db.prepare('SELECT id FROM users WHERE username=?').get(COACH_DEMO_CREDENTIALS.username) as {id:number}|undefined;
  if(!coachDemo){const id=Number(db.prepare("INSERT INTO users(username,password_hash,athlete_enabled,coach_enabled,role) VALUES(?,?,1,1,'user')").run(COACH_DEMO_CREDENTIALS.username,await bcrypt.hash(COACH_DEMO_CREDENTIALS.password,12)).lastInsertRowid);coachDemo={id};coachDemoCreated=true;seedExecutionTypes(db,id);}
  const coachLinkCreated=Boolean(db.prepare('INSERT OR IGNORE INTO coach_links(athlete_id,coach_id) VALUES(?,?)').run(demo.id,coachDemo.id).changes);
  let admin=db.prepare('SELECT id FROM users WHERE username=?').get(ADMIN_CREDENTIALS.username) as {id:number}|undefined;
  if(!admin){const id=Number(db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,'admin')").run(ADMIN_CREDENTIALS.username,await bcrypt.hash(ADMIN_CREDENTIALS.password,12)).lastInsertRowid);admin={id};adminCreated=true;seedExecutionTypes(db,id);}
  return {demoCreated,demoShowcaseCreated,coachDemoCreated,coachLinkCreated,adminCreated};
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
}

function ensureDemoShowcaseTraining(db:Db,userId:number):boolean {
  const existing=db.prepare(`SELECT t.id FROM trainings t WHERE t.user_id=? AND (SELECT COUNT(*) FROM training_entries te WHERE te.training_id=t.id)>=5 LIMIT 1`).get(userId);
  if(existing)return false;
  const typeRows=db.prepare("SELECT id,name FROM execution_types WHERE user_id=? AND deleted_at IS NULL").all(userId) as {id:number;name:string}[];
  const types=new Map(typeRows.map((type)=>[type.name,type]));const net=types.get('Siatka')!;const mat=types.get('Materac')!;const foam=types.get('Gąbki')!;
  const elements=db.prepare('SELECT id,code,name FROM elements WHERE user_id=? AND deleted_at IS NULL').all(userId) as {id:number;code:string;name:string|null}[];
  const byCode=new Map(elements.map((element)=>[element.code,element]));
  const direct=(code:string,repetitions:number,type:{id:number;name:string})=>{const element=byCode.get(code)!;return{kind:'element' as const,sourceElementId:element.id,code:element.code,name:element.name,repetitions,executionTypeId:type.id,executionTypeName:type.name};};
  const routine=(name:string,start:number,end:number,repetitions:number,landings:{id:number;name:string}[])=>{const source=db.prepare('SELECT id,template_version version FROM routines WHERE user_id=? AND name=? AND deleted_at IS NULL').get(userId,name) as {id:number;version:number};const slots=db.prepare(`SELECT ri.position,ri.element_id id,COALESCE(e.code,ri.code_snapshot) code,COALESCE(e.name,ri.name_snapshot) name FROM routine_items ri LEFT JOIN elements e ON e.id=ri.element_id WHERE ri.routine_id=? ORDER BY ri.position`).all(source.id) as {position:number;id:number;code:string;name:string|null}[];const selected=slots.slice(start-1,end);return{kind:'routine' as const,sourceRoutineId:source.id,sourceRoutineName:name,sourceTemplateVersion:source.version,rangeStart:start,rangeEnd:end,isFullRange:start===1&&end===slots.length,repetitions,executionTypeId:net.id,executionTypeName:net.name,elements:selected.map((slot,index)=>{const landing=landings[index]??net;return{sourceElementId:slot.id,code:slot.code,name:slot.name,position:slot.position,executionTypeId:landing.id,executionTypeName:landing.name};})};};
  const date=new Date().toISOString().slice(0,10);
  saveTraining(db,userId,{date,entries:[
    {defaultExecutionTypeId:net.id,defaultExecutionTypeName:net.name,activities:[direct('40o',3,net),direct('41<',2,net)]},
    {defaultExecutionTypeId:net.id,defaultExecutionTypeName:net.name,activities:[routine('Układ 1',1,8,1,[net,net,net,net,net,net,mat,mat])]},
    {defaultExecutionTypeId:mat.id,defaultExecutionTypeName:mat.name,activities:[direct('800o',2,mat),direct('831o',1,mat)]},
    {defaultExecutionTypeId:net.id,defaultExecutionTypeName:net.name,activities:[routine('Układ 2',1,5,2,[net,net,net,mat,mat])]},
    {defaultExecutionTypeId:foam.id,defaultExecutionTypeName:foam.name,activities:[direct('12000/',1,foam),direct('12111o',2,foam)]},
  ]});
  return true;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const db=openDatabase();
  try {
    const result=await seedDemoAndAdmin(db);
    console.log(`${result.demoCreated?'Utworzono':'Pozostawiono istniejące'} konto demo. Dane logowania dla nowego konta: ${DEMO_CREDENTIALS.username} / ${DEMO_CREDENTIALS.password}`);
    console.log(`${result.demoShowcaseCreated?'Dodano':'Pozostawiono istniejący'} wielowejściowy trening demonstracyjny.`);
    console.log(`${result.coachDemoCreated?'Utworzono':'Pozostawiono istniejące'} konto demo trenera. Dane logowania dla nowego konta: ${COACH_DEMO_CREDENTIALS.username} / ${COACH_DEMO_CREDENTIALS.password}`);
    console.log(`${result.coachLinkCreated?'Połączono':'Pozostawiono połączenie'} konto demo trenera z zawodnikiem demo.`);
    console.log(`${result.adminCreated?'Utworzono':'Pozostawiono istniejące'} konto admin. Dane logowania dla nowego konta: ${ADMIN_CREDENTIALS.username} / ${ADMIN_CREDENTIALS.password}`);
    if(!result.demoCreated||!result.coachDemoCreated||!result.adminCreated)console.log('Istniejących kont i ich haseł ani danych nie zmieniono.');
  } finally {db.close();}
}
