import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { openDatabase, seedExecutionTypes, type Db } from './db.js';
import { getTraining, saveTraining, trainingSummary, type TrainingInput } from './training-service.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const bool = (value: unknown) => value ? 1 : 0;
const text = (value: unknown, label: string, min = 1) => {
  if (typeof value !== 'string' || value.trim().length < min) throw new Error(`${label} jest nieprawidłowe.`);
  return value.trim();
};

declare module 'fastify' { interface FastifyRequest { userId: number } }

export async function buildApp(options: { db?: Db; logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const db = options.db ?? openDatabase();
  app.decorate('db', db);
  await app.register(cookie);
  await app.register(rateLimit, { max: 150, timeWindow: '1 minute' });

  app.addHook('onClose', async () => { if (!options.db) db.close(); });
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode ?? (err.message.includes('znaleziono') ? 404 : 400);
    reply.status(status).send({ message: status >= 500 ? 'Wystąpił błąd serwera.' : err.message });
  });

  async function authenticate(request: FastifyRequest, reply: any) {
    const token = request.cookies.acronote_session;
    if (!token) return reply.status(401).send({ message: 'Zaloguj się, aby kontynuować.' });
    const session = db.prepare(`SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>datetime('now')`).get(hashToken(token)) as { user_id:number } | undefined;
    if (!session) return reply.status(401).send({ message: 'Sesja wygasła. Zaloguj się ponownie.' });
    request.userId = session.user_id;
  }
  const auth = { preHandler: authenticate };

  app.get('/api/health', async () => ({ ok: true }));
  app.post('/api/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = request.body as any;
    const username = text(body?.username, 'Nazwa użytkownika', 3);
    const password = text(body?.password, 'Hasło', 10);
    if (!/^[\p{L}\p{N}_.-]+$/u.test(username)) throw new Error('Nazwa użytkownika zawiera niedozwolone znaki.');
    const passwordHash = await bcrypt.hash(password, 12);
    let userId: number;
    try { userId = Number(db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run(username, passwordHash).lastInsertRowid); }
    catch { return reply.status(409).send({ message: 'Ta nazwa użytkownika jest już zajęta.' }); }
    seedExecutionTypes(db, userId);
    createSession(db, userId, reply);
    return reply.status(201).send({ id: userId, username, athleteEnabled: true, coachEnabled: false });
  });
  app.post('/api/auth/login', { config: { rateLimit: { max: 15, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = request.body as any;
    const username = text(body?.username, 'Nazwa użytkownika');
    const password = text(body?.password, 'Hasło');
    const user = db.prepare('SELECT id,username,password_hash,athlete_enabled,coach_enabled FROM users WHERE username=?').get(username) as any;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return reply.status(401).send({ message: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
    createSession(db, user.id, reply);
    return publicUser(user);
  });
  app.post('/api/auth/logout', auth, async (request, reply) => {
    const token = request.cookies.acronote_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    reply.clearCookie('acronote_session', { path: '/' }); return { ok: true };
  });
  app.get('/api/auth/me', auth, async request => publicUser(db.prepare('SELECT id,username,athlete_enabled,coach_enabled FROM users WHERE id=?').get(request.userId)));
  app.put('/api/auth/password', auth, async (request, reply) => {
    const body = request.body as any; const current = text(body?.currentPassword, 'Obecne hasło'); const next = text(body?.newPassword, 'Nowe hasło', 10);
    const user = db.prepare('SELECT password_hash FROM users WHERE id=?').get(request.userId) as any;
    if (!(await bcrypt.compare(current, user.password_hash))) return reply.status(403).send({ message: 'Obecne hasło jest nieprawidłowe.' });
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(next, 12), request.userId);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(request.userId, hashToken(request.cookies.acronote_session!));
    return { ok: true };
  });
  app.put('/api/profile', auth, async request => {
    const body=request.body as any; db.prepare('UPDATE users SET athlete_enabled=?,coach_enabled=? WHERE id=?').run(bool(body.athleteEnabled),bool(body.coachEnabled),request.userId);
    return publicUser(db.prepare('SELECT id,username,athlete_enabled,coach_enabled FROM users WHERE id=?').get(request.userId));
  });

  app.get('/api/execution-types', auth, async request => db.prepare(`SELECT id,name,sort_order sortOrder,hidden FROM execution_types WHERE user_id=? AND deleted_at IS NULL ORDER BY sort_order,id`).all(request.userId));
  app.post('/api/execution-types', auth, async (request, reply) => {
    const body=request.body as any; const name=text(body?.name,'Nazwa');
    const order=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM execution_types WHERE user_id=?').get(request.userId) as any).n;
    const id=Number(db.prepare('INSERT INTO execution_types(user_id,name,sort_order) VALUES(?,?,?)').run(request.userId,name,order).lastInsertRowid);
    return reply.status(201).send({id,name,sortOrder:order,hidden:false});
  });
  app.put('/api/execution-types/:id', auth, async request => {
    const body=request.body as any; const info=db.prepare('UPDATE execution_types SET name=?,sort_order=?,hidden=? WHERE id=? AND user_id=? AND deleted_at IS NULL').run(text(body.name,'Nazwa'),Number(body.sortOrder??0),bool(body.hidden),Number((request.params as any).id),request.userId);
    if (!info.changes) throw new Error('Nie znaleziono rodzaju wykonania.'); return {ok:true};
  });
  app.delete('/api/execution-types/:id', auth, async request => { db.prepare("UPDATE execution_types SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(Number((request.params as any).id),request.userId); return {ok:true}; });

  app.get('/api/elements', auth, async request => {
    const q=request.query as any; const conditions=['user_id=?','deleted_at IS NULL']; const values:any[]=[request.userId];
    if (q.hidden !== 'all') conditions.push('hidden=0'); if (q.favorite === 'true') conditions.push('favorite=1');
    if (q.search) { conditions.push('(code LIKE ? OR name LIKE ?)'); values.push(`%${q.search}%`,`%${q.search}%`); }
    return db.prepare(`SELECT id,code,name,favorite,hidden FROM elements WHERE ${conditions.join(' AND ')} ORDER BY favorite DESC,code`).all(...values);
  });
  app.post('/api/elements', auth, async (request,reply) => {
    const b=request.body as any; let id:number; try{id=Number(db.prepare('INSERT INTO elements(user_id,code,name,favorite,hidden) VALUES(?,?,?,?,?)').run(request.userId,text(b.code,'Kod'),b.name?.trim()||null,bool(b.favorite),bool(b.hidden)).lastInsertRowid);}catch{return reply.status(409).send({message:'Element o tym kodzie już istnieje.'});}
    return reply.status(201).send({id,code:b.code.trim(),name:b.name?.trim()||null,favorite:!!b.favorite,hidden:!!b.hidden});
  });
  app.put('/api/elements/:id', auth, async request => { const b=request.body as any; const id=Number((request.params as any).id); const info=db.prepare('UPDATE elements SET code=?,name=?,favorite=?,hidden=? WHERE id=? AND user_id=? AND deleted_at IS NULL').run(text(b.code,'Kod'),b.name?.trim()||null,bool(b.favorite),bool(b.hidden),id,request.userId); if(!info.changes)throw new Error('Nie znaleziono elementu.'); return {ok:true}; });
  app.delete('/api/elements/:id', auth, async request => {
    const id=Number((request.params as any).id); const q=request.query as any; const element=db.prepare('SELECT code,name FROM elements WHERE id=? AND user_id=?').get(id,request.userId) as any; if(!element)throw new Error('Nie znaleziono elementu.');
    const tx=db.transaction(()=>{ if(q.routineHandling==='remove') db.prepare('DELETE FROM routine_items WHERE element_id=? AND routine_id IN (SELECT id FROM routines WHERE user_id=?)').run(id,request.userId); else db.prepare('UPDATE routine_items SET element_id=NULL,code_snapshot=?,name_snapshot=? WHERE element_id=? AND routine_id IN (SELECT id FROM routines WHERE user_id=?)').run(element.code,element.name,id,request.userId); db.prepare("UPDATE elements SET deleted_at=CURRENT_TIMESTAMP WHERE id=?").run(id); }); tx(); return {ok:true};
  });

  app.get('/api/routines', auth, async request => listRoutines(db,request.userId));
  app.get('/api/routines/:id', auth, async request => { const routine=listRoutines(db,request.userId,Number((request.params as any).id))[0]; if(!routine)throw new Error('Nie znaleziono układu.'); return routine; });
  app.post('/api/routines', auth, async (request,reply) => { const id=saveRoutine(db,request.userId,request.body as any); return reply.status(201).send(listRoutines(db,request.userId,id)[0]); });
  app.put('/api/routines/:id', auth, async request => { const id=saveRoutine(db,request.userId,request.body as any,Number((request.params as any).id)); return listRoutines(db,request.userId,id)[0]; });
  app.delete('/api/routines/:id', auth, async request => { const info=db.prepare("UPDATE routines SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(Number((request.params as any).id),request.userId); if(!info.changes)throw new Error('Nie znaleziono układu.'); return {ok:true}; });

  app.get('/api/trainings', auth, async request => { const q=request.query as any; const conditions=['t.user_id=?'];const values:any[]=[request.userId];if(q.from){conditions.push('t.training_date>=?');values.push(q.from)}if(q.to){conditions.push('t.training_date<=?');values.push(q.to)}return db.prepare(`SELECT t.id,t.training_date date,t.created_at createdAt,t.updated_at updatedAt,
    (SELECT COUNT(*) FROM training_entries te WHERE te.training_id=t.id) entriesCount,
    COALESCE((SELECT SUM(CASE WHEN a.kind='element' THEN a.repetitions ELSE a.repetitions*(SELECT COUNT(*) FROM activity_elements ae WHERE ae.activity_id=a.id) END) FROM training_entries te JOIN activities a ON a.entry_id=te.id WHERE te.training_id=t.id),0) totalElements
    FROM trainings t WHERE ${conditions.join(' AND ')} ORDER BY t.training_date DESC,t.id DESC`).all(...values); });
  app.get('/api/trainings/:id', auth, async request => { const item=getTraining(db,request.userId,Number((request.params as any).id));if(!item)throw new Error('Nie znaleziono treningu.');return item; });
  app.post('/api/trainings', auth, async (request,reply) => { const id=saveTraining(db,request.userId,request.body as TrainingInput);return reply.status(201).send(getTraining(db,request.userId,id)); });
  app.put('/api/trainings/:id', auth, async request => { const id=saveTraining(db,request.userId,request.body as TrainingInput,Number((request.params as any).id));return getTraining(db,request.userId,id); });
  app.delete('/api/trainings/:id', auth, async request => { const info=db.prepare('DELETE FROM trainings WHERE id=? AND user_id=?').run(Number((request.params as any).id),request.userId);if(!info.changes)throw new Error('Nie znaleziono treningu.');return {ok:true}; });
  app.get('/api/stats/summary', auth, async request => { const q=request.query as any;return trainingSummary(db,request.userId,q.from,q.to); });
  app.get('/api/stats/elements/:id/history', auth, async (request,reply) => {
    const id=Number((request.params as any).id);const element=db.prepare('SELECT id,code,name FROM elements WHERE id=? AND user_id=?').get(id,request.userId) as any;
    if(!element)return reply.status(404).send({message:'Nie znaleziono elementu.'});
    const direct=db.prepare(`SELECT t.id trainingId,t.training_date date,SUM(a.repetitions) count FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id WHERE t.user_id=? AND a.kind='element' AND a.source_element_id=? GROUP BY t.id`).all(request.userId,id) as any[];
    const nested=db.prepare(`SELECT t.id trainingId,t.training_date date,SUM(a.repetitions) count FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id JOIN activity_elements ae ON ae.activity_id=a.id WHERE t.user_id=? AND ae.source_element_id=? GROUP BY t.id`).all(request.userId,id) as any[];
    const map=new Map<number,any>();for(const row of [...direct,...nested]){const old=map.get(row.trainingId);map.set(row.trainingId,{trainingId:row.trainingId,date:row.date,count:Number(row.count)+(old?.count??0)});}const trainings=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const group=(format:string)=>db.prepare(`SELECT strftime('${format}',t.training_date) period,SUM(x.count) count FROM (SELECT te.training_id,SUM(a.repetitions) count FROM training_entries te JOIN activities a ON a.entry_id=te.id WHERE a.kind='element' AND a.source_element_id=? GROUP BY te.training_id UNION ALL SELECT te.training_id,SUM(a.repetitions) count FROM training_entries te JOIN activities a ON a.entry_id=te.id JOIN activity_elements ae ON ae.activity_id=a.id WHERE ae.source_element_id=? GROUP BY te.training_id) x JOIN trainings t ON t.id=x.training_id WHERE t.user_id=? GROUP BY period ORDER BY period`).all(id,id,request.userId);
    return {element,trainings,weeks:group('%Y-W%W'),months:group('%Y-%m')};
  });

  app.post('/api/coach/invitations', auth, async (request,reply) => {
    const b=request.body as any; const role=b.role==='coach'?'coach':'athlete';
    const profile=db.prepare('SELECT athlete_enabled,coach_enabled FROM users WHERE id=?').get(request.userId) as any;
    if((role==='coach'&&!profile.coach_enabled)||(role==='athlete'&&!profile.athlete_enabled)) return reply.status(403).send({message:'Najpierw aktywuj odpowiedni profil.'});
    const token=randomBytes(24).toString('base64url'); const shortCode=randomBytes(4).toString('hex').toUpperCase();
    const id=Number(db.prepare("INSERT INTO invitations(creator_id,role,token_hash,short_code_hash,expires_at) VALUES(?,?,?,?,datetime('now','+24 hours'))").run(request.userId,role,hashToken(token),hashToken(shortCode)).lastInsertRowid);
    const path=`/zaproszenie/${token}`; const qrDataUrl=await QRCode.toDataURL(path,{margin:1,width:280});
    return reply.status(201).send({id,role,token,shortCode,path,qrDataUrl,expiresInHours:24});
  });
  app.post('/api/coach/invitations/accept', { ...auth, config:{rateLimit:{max:10,timeWindow:'15 minutes'}} }, async (request,reply) => {
    const b=request.body as any; const credential=text(b.token??b.shortCode,'Kod zaproszenia');
    const invitation=db.prepare("SELECT id,creator_id,role FROM invitations WHERE (token_hash=? OR short_code_hash=?) AND used_at IS NULL AND expires_at>datetime('now')").get(hashToken(credential),hashToken(credential.toUpperCase())) as any;
    if(!invitation)return reply.status(404).send({message:'Zaproszenie jest nieprawidłowe lub wygasło.'});
    const athleteId=invitation.role==='athlete'?invitation.creator_id:request.userId; const coachId=invitation.role==='coach'?invitation.creator_id:request.userId;
    if(athleteId===coachId)return reply.status(400).send({message:'Nie możesz połączyć konta z samym sobą.'});
    const athlete=db.prepare('SELECT athlete_enabled FROM users WHERE id=?').get(athleteId) as any; const coach=db.prepare('SELECT coach_enabled FROM users WHERE id=?').get(coachId) as any;
    if(!athlete?.athlete_enabled||!coach?.coach_enabled)return reply.status(400).send({message:'Oba wymagane profile muszą być aktywne.'});
    db.transaction(()=>{db.prepare('INSERT OR IGNORE INTO coach_links(athlete_id,coach_id) VALUES(?,?)').run(athleteId,coachId);db.prepare("UPDATE invitations SET used_at=CURRENT_TIMESTAMP WHERE id=?").run(invitation.id);})();
    return {ok:true};
  });
  app.get('/api/coach/athletes', auth, async request => db.prepare(`SELECT u.id,u.username,cl.is_primary isPrimary,cl.created_at connectedAt FROM coach_links cl JOIN users u ON u.id=cl.athlete_id WHERE cl.coach_id=? ORDER BY u.username`).all(request.userId));
  app.delete('/api/coach/links/:athleteId', auth, async request => { const athleteId=Number((request.params as any).athleteId);const info=db.prepare('DELETE FROM coach_links WHERE athlete_id=? AND coach_id=?').run(athleteId,request.userId);if(!info.changes)throw new Error('Nie znaleziono połączenia.');return{ok:true}; });
  app.get('/api/athlete/coaches', auth, async request => db.prepare(`SELECT u.id,u.username,cl.is_primary isPrimary,cl.created_at connectedAt FROM coach_links cl JOIN users u ON u.id=cl.coach_id WHERE cl.athlete_id=? ORDER BY cl.is_primary DESC,u.username`).all(request.userId));
  app.delete('/api/athlete/coaches/:coachId', auth, async request => { const coachId=Number((request.params as any).coachId);const info=db.prepare('DELETE FROM coach_links WHERE athlete_id=? AND coach_id=?').run(request.userId,coachId);if(!info.changes)throw new Error('Nie znaleziono połączenia.');return{ok:true}; });
  app.put('/api/athlete/coaches/:coachId/primary', auth, async request => { const coachId=Number((request.params as any).coachId);const tx=db.transaction(()=>{const exists=db.prepare('SELECT 1 FROM coach_links WHERE athlete_id=? AND coach_id=?').get(request.userId,coachId);if(!exists)throw new Error('Nie znaleziono połączenia.');db.prepare('UPDATE coach_links SET is_primary=0 WHERE athlete_id=?').run(request.userId);db.prepare('UPDATE coach_links SET is_primary=1 WHERE athlete_id=? AND coach_id=?').run(request.userId,coachId);});tx();return{ok:true}; });
  app.get('/api/coach/athletes/:athleteId/trainings', auth, async (request,reply) => { const athleteId=Number((request.params as any).athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return reply.status(403).send({message:'Brak dostępu do danych zawodnika.'});return db.prepare('SELECT id,training_date date,created_at createdAt,updated_at updatedAt FROM trainings WHERE user_id=? ORDER BY training_date DESC,id DESC').all(athleteId); });
  app.get('/api/coach/athletes/:athleteId/trainings/:id', auth, async (request,reply) => { const p=request.params as any;const athleteId=Number(p.athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return reply.status(403).send({message:'Brak dostępu do danych zawodnika.'});const item=getTraining(db,athleteId,Number(p.id));return item??reply.status(404).send({message:'Nie znaleziono treningu.'}); });
  app.get('/api/coach/athletes/:athleteId/stats', auth, async (request,reply) => { const athleteId=Number((request.params as any).athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return reply.status(403).send({message:'Brak dostępu do danych zawodnika.'});const q=request.query as any;return trainingSummary(db,athleteId,q.from,q.to); });

  const webRoot=resolve(fileURLToPath(new URL('../../../packages/web/dist',import.meta.url)));
  if(existsSync(webRoot)){await app.register(staticPlugin,{root:webRoot});app.setNotFoundHandler((request,reply)=>{if(!request.url.startsWith('/api/'))return reply.sendFile('index.html');return reply.status(404).send({message:'Nie znaleziono zasobu.'});});}
  return app;
}

function createSession(db:Db,userId:number,reply:any){const token=randomBytes(32).toString('base64url');db.prepare("DELETE FROM sessions WHERE expires_at<=datetime('now')").run();db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,datetime('now','+30 days'))").run(userId,hashToken(token));reply.setCookie('acronote_session',token,{httpOnly:true,sameSite:'strict',secure:false,path:'/',maxAge:60*60*24*30});}
function publicUser(user:any){return{id:user.id,username:user.username,athleteEnabled:!!user.athlete_enabled,coachEnabled:!!user.coach_enabled};}
function listRoutines(db:Db,userId:number,id?:number){const rows=db.prepare(`SELECT id,name,template_version templateVersion,slot_count slotCount FROM routines WHERE user_id=? AND deleted_at IS NULL ${id?'AND id=?':''} ORDER BY name`).all(...(id?[userId,id]:[userId])) as any[];for(const row of rows)row.items=db.prepare(`SELECT ri.position,ri.element_id elementId,COALESCE(e.code,ri.code_snapshot) code,COALESCE(e.name,ri.name_snapshot) name FROM routine_items ri LEFT JOIN elements e ON e.id=ri.element_id AND e.deleted_at IS NULL WHERE routine_id=? ORDER BY position`).all(row.id);return rows;}
function saveRoutine(db:Db,userId:number,b:any,id?:number){const name=text(b.name,'Nazwa układu');const slotCount=Math.max(1,Math.min(100,Number(b.slotCount??10)));const items=Array.isArray(b.items)?b.items:[];return db.transaction(()=>{if(id){const info=db.prepare('UPDATE routines SET name=?,slot_count=?,template_version=template_version+1 WHERE id=? AND user_id=? AND deleted_at IS NULL').run(name,slotCount,id,userId);if(!info.changes)throw new Error('Nie znaleziono układu.');db.prepare('DELETE FROM routine_items WHERE routine_id=?').run(id);}else id=Number(db.prepare('INSERT INTO routines(user_id,name,slot_count) VALUES(?,?,?)').run(userId,name,slotCount).lastInsertRowid);const insert=db.prepare('INSERT INTO routine_items(routine_id,position,element_id,code_snapshot,name_snapshot) VALUES(?,?,?,?,?)');items.forEach((item:any,index:number)=>{let code=item.code,nameValue=item.name??null;if(item.elementId){const element=db.prepare('SELECT code,name FROM elements WHERE id=? AND user_id=? AND deleted_at IS NULL').get(item.elementId,userId) as any;if(!element)throw new Error('Wybrany element nie istnieje.');code=element.code;nameValue=element.name;}insert.run(id,index+1,item.elementId??null,text(code,'Kod elementu'),nameValue);});return id!;})();}
function hasCoachAccess(db:Db,athleteId:number,coachId:number){return Boolean(db.prepare('SELECT 1 FROM coach_links WHERE athlete_id=? AND coach_id=?').get(athleteId,coachId));}
