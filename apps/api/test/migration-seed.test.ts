import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, seedExecutionTypes, type Db } from '../src/db.js';
import { seedDemoAndAdmin } from '../src/seed.js';

describe('migracja i dane startowe',()=>{
  let db:Db|undefined;afterEach(()=>db?.close());
  it('używa nazwy Siatka dla katalogu, nie zmieniając historycznych migawek',()=>{
    db=openDatabase(':memory:');const userId=Number(db.prepare("INSERT INTO users(username,password_hash) VALUES('u','h')").run().lastInsertRowid);seedExecutionTypes(db,userId);
    expect((db.prepare('SELECT MAX(version) version FROM migrations').get() as any).version).toBe(3);
    expect((db.prepare('PRAGMA table_info(invitations)').all() as any[]).map(column=>column.name)).toEqual(expect.arrayContaining(['accepted_by_id','cancelled_at','created_at']));
    expect(db.prepare('SELECT name FROM execution_types WHERE user_id=? ORDER BY sort_order').all(userId)).toMatchObject([{name:'Siatka'},{name:'Materac'},{name:'Gąbki'}]);
    db.prepare("INSERT INTO trainings(user_id,training_date) VALUES(?,'2026-01-01')").run(userId);const trainingId=(db.prepare('SELECT id FROM trainings').get() as any).id;
    db.prepare("INSERT INTO training_entries(training_id,position,default_execution_type_name) VALUES(?,1,'Na płasko')").run(trainingId);
    expect((db.prepare('SELECT default_execution_type_name name FROM training_entries').get() as any).name).toBe('Na płasko');
  });
  it('tworzy demo zawodnika, trenera i admina obok istniejących kont, a kolejne uruchomienie niczego nie dubluje',async()=>{
    db=openDatabase(':memory:');db.prepare("INSERT INTO users(username,password_hash) VALUES('existing','hash')").run();
    expect(await seedDemoAndAdmin(db)).toEqual({demoCreated:true,demoShowcaseCreated:true,coachDemoCreated:true,coachLinkCreated:true,adminCreated:true});
    expect(await seedDemoAndAdmin(db)).toEqual({demoCreated:false,demoShowcaseCreated:false,coachDemoCreated:false,coachLinkCreated:false,adminCreated:false});
    expect((db.prepare("SELECT COUNT(*) count FROM elements e JOIN users u ON u.id=e.user_id WHERE u.username='demo'").get() as any).count).toBe(30);
    expect((db.prepare("SELECT COUNT(*) count FROM routines r JOIN users u ON u.id=r.user_id WHERE u.username='demo'").get() as any).count).toBe(2);
    expect((db.prepare("SELECT COUNT(*) count FROM routine_items ri JOIN routines r ON r.id=ri.routine_id JOIN users u ON u.id=r.user_id WHERE u.username='demo' AND r.name='Układ 2' AND ri.element_id=(SELECT element_id FROM routine_items WHERE routine_id=r.id GROUP BY element_id HAVING COUNT(*)>1)").get() as any).count).toBe(2);
    expect((db.prepare("SELECT role FROM users WHERE username='admin'").get() as any).role).toBe('admin');
    expect(db.prepare("SELECT c.coach_enabled coachEnabled,a.username athlete FROM coach_links cl JOIN users c ON c.id=cl.coach_id JOIN users a ON a.id=cl.athlete_id WHERE c.username='trener_demo'").get()).toMatchObject({coachEnabled:1,athlete:'demo'});
    expect((db.prepare("SELECT MAX(entries) entries FROM (SELECT COUNT(*) entries FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN users u ON u.id=t.user_id WHERE u.username='demo' GROUP BY t.id)").get() as any).entries).toBe(5);
  },15000);
});
