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
import { validateElementCode } from '@acronote/shared';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const bool = (value: unknown) => value ? 1 : 0;
const text = (value: unknown, label: string, min = 1) => {
  if (typeof value !== 'string' || value.trim().length < min) throw new Error(`${label} jest nieprawidłowe.`);
  return value.trim();
};
const usernameText = (value: unknown) => {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)) throw new Error('Nazwa użytkownika zawiera niedozwolone znaki.');
  const username = value.normalize('NFC').trim().replace(/\p{Zs}+/gu, ' ');
  if (username.length < 3 || username.length > 80 || !/^[\p{L}\p{N}_.-]+(?: [\p{L}\p{N}_.-]+)*$/u.test(username)) throw new Error('Nazwa użytkownika zawiera niedozwolone znaki.');
  return username;
};

declare module 'fastify' { interface FastifyRequest { userId: number; userRole: 'user' | 'admin' } }

export async function buildApp(options: { db?: Db; logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const db = options.db ?? openDatabase();
  app.decorate('db', db);
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 150,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Zbyt wiele prób',
      message: `Zbyt wiele prób. Spróbuj ponownie za ${Math.max(1, Math.ceil(context.ttl / 60000))} min.`
    })
  });

  app.addHook('onClose', async () => { if (!options.db) db.close(); });
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = err.statusCode ?? (err.message.includes('znaleziono') ? 404 : 400);
    reply.status(status).send({ message: status >= 500 ? 'Wystąpił błąd serwera.' : err.message });
  });

  async function authenticate(request: FastifyRequest, reply: any) {
    const token = request.cookies.acronote_session;
    if (!token) return reply.status(401).send({ message: 'Zaloguj się, aby kontynuować.' });
    const session = db.prepare(`SELECT s.user_id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.deleted_at IS NULL`).get(hashToken(token)) as { user_id:number; role:'user'|'admin' } | undefined;
    if (!session) return reply.status(401).send({ message: 'Sesja wygasła. Zaloguj się ponownie.' });
    request.userId = session.user_id;
    request.userRole = session.role;
  }
  const auth = { preHandler: authenticate };
  async function authenticateAdmin(request: FastifyRequest, reply: any) {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (request.userRole !== 'admin') return reply.status(403).send({ message: 'Ta operacja wymaga konta administratora.' });
  }
  const adminAuth = { preHandler: authenticateAdmin };

  app.get('/api/health', async () => ({ ok: true }));
  app.post('/api/auth/register', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const body = request.body as any;
    const username = usernameText(body?.username);
    const password = text(body?.password, 'Hasło', 10);
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
    const username = usernameText(body?.username);
    const password = text(body?.password, 'Hasło');
    const user = db.prepare('SELECT id,username,password_hash,athlete_enabled,coach_enabled,role FROM users WHERE username=? AND deleted_at IS NULL').get(username) as any;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return reply.status(401).send({ message: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
    createSession(db, user.id, reply);
    return publicUser(user);
  });
  app.post('/api/auth/logout', auth, async (request, reply) => {
    const token = request.cookies.acronote_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    reply.clearCookie('acronote_session', { path: '/' }); return { ok: true };
  });
  app.get('/api/auth/me', auth, async request => publicUser(db.prepare('SELECT id,username,athlete_enabled,coach_enabled,role FROM users WHERE id=?').get(request.userId)));
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
    return publicUser(db.prepare('SELECT id,username,athlete_enabled,coach_enabled,role FROM users WHERE id=?').get(request.userId));
  });

  app.get('/api/execution-types', auth, async request => db.prepare(`SELECT id,name,sort_order sortOrder,hidden FROM execution_types WHERE user_id=? AND deleted_at IS NULL ORDER BY sort_order,id`).all(request.userId));
  app.post('/api/execution-types', auth, async (request, reply) => {
    const body=request.body as any; const name=text(body?.name,'Nazwa miejsca lądowania');
    const order=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM execution_types WHERE user_id=?').get(request.userId) as any).n;
    const id=Number(db.prepare('INSERT INTO execution_types(user_id,name,sort_order) VALUES(?,?,?)').run(request.userId,name,order).lastInsertRowid);
    return reply.status(201).send({id,name,sortOrder:order,hidden:false});
  });
  app.put('/api/execution-types/:id', auth, async request => {
    const body=request.body as any; const info=db.prepare('UPDATE execution_types SET name=?,sort_order=?,hidden=? WHERE id=? AND user_id=? AND deleted_at IS NULL').run(text(body.name,'Nazwa miejsca lądowania'),Number(body.sortOrder??0),bool(body.hidden),Number((request.params as any).id),request.userId);
    if (!info.changes) throw new Error('Nie znaleziono miejsca lądowania.'); return {ok:true};
  });
  app.delete('/api/execution-types/:id', auth, async request => { db.prepare("UPDATE execution_types SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(Number((request.params as any).id),request.userId); return {ok:true}; });

  app.get('/api/elements', auth, async request => {
    const q=request.query as any; const conditions=['user_id=?','deleted_at IS NULL']; const values:any[]=[request.userId];
    if (q.hidden === 'true') conditions.push('hidden=1'); else if (q.hidden !== 'all') conditions.push('hidden=0');
    if (q.favorite === 'true') conditions.push('favorite=1');
    if (q.search) { conditions.push('(code LIKE ? OR name LIKE ?)'); values.push(`%${q.search}%`,`%${q.search}%`); }
    if (q.quarterCount !== undefined) { conditions.push('quarter_count=?'); values.push(integerQuery(q.quarterCount,'Liczba ćwiartek')); }
    if (q.saltoCount !== undefined) { conditions.push('salto_count=?'); values.push(integerQuery(q.saltoCount,'Liczba salt')); }
    if (q.totalTwists !== undefined) { const twists=Number(q.totalTwists); if(!Number.isFinite(twists)||twists<0||!Number.isInteger(twists*2))throw new Error('Liczba śrub musi być wielokrotnością 0,5.');conditions.push('total_twist_halves=?');values.push(twists*2); }
    if (q.direction !== undefined) { if(!['front','back'].includes(q.direction))throw new Error('Kierunek musi mieć wartość front albo back.');conditions.push('direction=?');values.push(q.direction); }
    if (q.position !== undefined) { if(!['o','<','/'].includes(q.position))throw new Error('Pozycja musi mieć wartość o, < albo /.');conditions.push('position_symbol=?');values.push(q.position); }
    return db.prepare(`SELECT id,code,name,favorite,hidden,quarter_count quarterCount,salto_count saltoCount,total_twist_halves/2.0 totalTwists,direction,position_symbol positionSymbol FROM elements WHERE ${conditions.join(' AND ')} ORDER BY favorite DESC,code`).all(...values);
  });
  app.post('/api/elements', auth, async (request,reply) => {
    const b=request.body as any; const parsed=validateElementCode(b?.code); let id:number; try{id=Number(db.prepare('INSERT INTO elements(user_id,code,name,favorite,hidden,quarter_count,salto_count,total_twist_halves,direction,position_symbol) VALUES(?,?,?,?,?,?,?,?,?,?)').run(request.userId,parsed.code,b.name?.trim()||null,bool(b.favorite),bool(b.hidden),parsed.quarterCount,parsed.saltoCount,parsed.totalTwistHalves,parsed.direction,parsed.positionSymbol).lastInsertRowid);}catch{return reply.status(409).send({message:'Element o tym kodzie już istnieje.'});}
    return reply.status(201).send({id,code:parsed.code,name:b.name?.trim()||null,favorite:!!b.favorite,hidden:!!b.hidden,quarterCount:parsed.quarterCount,saltoCount:parsed.saltoCount,totalTwists:parsed.totalTwists,direction:parsed.direction,positionSymbol:parsed.positionSymbol});
  });
  app.put('/api/elements/:id', auth, async request => { const b=request.body as any; const parsed=validateElementCode(b?.code); const id=Number((request.params as any).id); const info=db.prepare('UPDATE elements SET code=?,name=?,favorite=?,hidden=?,quarter_count=?,salto_count=?,total_twist_halves=?,direction=?,position_symbol=? WHERE id=? AND user_id=? AND deleted_at IS NULL').run(parsed.code,b.name?.trim()||null,bool(b.favorite),bool(b.hidden),parsed.quarterCount,parsed.saltoCount,parsed.totalTwistHalves,parsed.direction,parsed.positionSymbol,id,request.userId); if(!info.changes)throw new Error('Nie znaleziono elementu.'); return {ok:true}; });
  app.get('/api/elements/:id/usage', auth, async request => elementUsage(db,request.userId,Number((request.params as any).id)));
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
  app.get('/api/stats/summary', auth, async (request,reply) => { const q=request.query as any;let elementId:number|undefined;if(q.elementId!==undefined){elementId=integerQuery(q.elementId,'Element');if(!db.prepare('SELECT 1 FROM elements WHERE id=? AND user_id=?').get(elementId,request.userId))return reply.status(404).send({message:'Nie znaleziono elementu.'});}return trainingSummary(db,request.userId,q.from,q.to,elementId); });
  app.get('/api/stats/elements/:id/history', auth, async (request,reply) => elementHistory(db,request.userId,Number((request.params as any).id),reply));

  app.get('/api/admin/users', adminAuth, async request => {
    const q=request.query as any; const includeDeleted=q.includeDeleted==='true';
    return db.prepare(`SELECT u.id,u.username,u.role,u.athlete_enabled athleteEnabled,u.coach_enabled coachEnabled,u.created_at createdAt,u.deleted_at deletedAt,
      (SELECT COUNT(*) FROM elements e WHERE e.user_id=u.id AND e.deleted_at IS NULL) elementsCount,
      (SELECT COUNT(*) FROM routines r WHERE r.user_id=u.id AND r.deleted_at IS NULL) routinesCount,
      (SELECT COUNT(*) FROM trainings t WHERE t.user_id=u.id) trainingsCount
      FROM users u ${includeDeleted?'':'WHERE u.deleted_at IS NULL'} ORDER BY u.username`).all();
  });
  app.get('/api/admin/users/:userId', adminAuth, async (request,reply) => {
    const userId=Number((request.params as any).userId); const user=adminUser(db,userId);
    return user??reply.status(404).send({message:'Nie znaleziono konta.'});
  });
  app.post('/api/admin/users', adminAuth, async (request,reply) => {
    const b=request.body as any; const username=usernameText(b?.username);const password=text(b?.password,'Hasło',10);const role=b?.role==='admin'?'admin':'user';
    let id:number;try{id=Number(db.prepare('INSERT INTO users(username,password_hash,athlete_enabled,coach_enabled,role) VALUES(?,?,?,?,?)').run(username,await bcrypt.hash(password,12),bool(b.athleteEnabled??true),bool(b.coachEnabled),role).lastInsertRowid);}catch{return reply.status(409).send({message:'Ta nazwa użytkownika jest już zajęta.'});}
    seedExecutionTypes(db,id);return reply.status(201).send(adminUser(db,id));
  });
  app.put('/api/admin/users/:userId', adminAuth, async (request,reply) => {
    const userId=Number((request.params as any).userId);const b=request.body as any;const current=db.prepare('SELECT * FROM users WHERE id=?').get(userId) as any;if(!current)return reply.status(404).send({message:'Nie znaleziono konta.'});
    const role=b.role===undefined?current.role:(b.role==='admin'?'admin':'user');
    if(userId===request.userId&&role!=='admin')return reply.status(400).send({message:'Nie możesz odebrać sobie roli administratora.'});
    const username=b.username===undefined?current.username:usernameText(b.username);
    try{db.prepare('UPDATE users SET username=?,athlete_enabled=?,coach_enabled=?,role=? WHERE id=?').run(username,bool(b.athleteEnabled??current.athlete_enabled),bool(b.coachEnabled??current.coach_enabled),role,userId);}catch{return reply.status(409).send({message:'Ta nazwa użytkownika jest już zajęta.'});}
    if(b.password!==undefined)db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(text(b.password,'Hasło',10),12),userId);
    return adminUser(db,userId);
  });
  app.delete('/api/admin/users/:userId', adminAuth, async (request,reply) => {
    const userId=Number((request.params as any).userId);if(userId===request.userId)return reply.status(400).send({message:'Nie możesz usunąć własnego konta administratora.'});
    const info=db.prepare("UPDATE users SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").run(userId);if(!info.changes)return reply.status(404).send({message:'Nie znaleziono aktywnego konta.'});db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);return{ok:true};
  });
  app.post('/api/admin/users/:userId/restore', adminAuth, async (request,reply) => {const userId=Number((request.params as any).userId);const info=db.prepare('UPDATE users SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL').run(userId);if(!info.changes)return reply.status(404).send({message:'Nie znaleziono usuniętego konta.'});return adminUser(db,userId);});
  app.put('/api/admin/users/:userId/reset-password', adminAuth, async (request,reply) => {const userId=Number((request.params as any).userId);const exists=db.prepare('SELECT 1 FROM users WHERE id=?').get(userId);if(!exists)return reply.status(404).send({message:'Nie znaleziono konta.'});const password=text((request.body as any)?.newPassword,'Nowe hasło',10);db.transaction(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password,12),userId);db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);})();return{ok:true};});
  app.get('/api/admin/users/:userId/data', adminAuth, async (request,reply) => {
    const userId=Number((request.params as any).userId);if(!adminUser(db,userId))return reply.status(404).send({message:'Nie znaleziono konta.'});
    return {elements:db.prepare('SELECT id,code,name,favorite,hidden,deleted_at deletedAt,created_at createdAt FROM elements WHERE user_id=? ORDER BY id').all(userId),routines:db.prepare('SELECT id,name,template_version templateVersion,slot_count slotCount,deleted_at deletedAt,created_at createdAt FROM routines WHERE user_id=? ORDER BY id').all(userId),trainings:db.prepare('SELECT id,training_date date,created_at createdAt,updated_at updatedAt FROM trainings WHERE user_id=? ORDER BY training_date DESC,id DESC').all(userId)};
  });
  app.get('/api/admin/users/:userId/trainings/:id', adminAuth, async (request,reply) => {const p=request.params as any;const training=getTraining(db,Number(p.userId),Number(p.id));return training??reply.status(404).send({message:'Nie znaleziono treningu.'});});
  app.put('/api/admin/users/:userId/trainings/:id', adminAuth, async request => {const p=request.params as any;const id=saveTraining(db,Number(p.userId),request.body as TrainingInput,Number(p.id));return getTraining(db,Number(p.userId),id);});
  app.delete('/api/admin/users/:userId/trainings/:id', adminAuth, async (request,reply) => {const p=request.params as any;const info=db.prepare('DELETE FROM trainings WHERE id=? AND user_id=?').run(Number(p.id),Number(p.userId));if(!info.changes)return reply.status(404).send({message:'Nie znaleziono treningu.'});return{ok:true};});
  app.delete('/api/admin/users/:userId/elements/:id', adminAuth, async (request,reply) => {const p=request.params as any;const info=db.prepare("UPDATE elements SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND deleted_at IS NULL").run(Number(p.id),Number(p.userId));if(!info.changes)return reply.status(404).send({message:'Nie znaleziono aktywnego elementu.'});return{ok:true};});
  app.post('/api/admin/users/:userId/elements/:id/restore', adminAuth, async (request,reply) => {const p=request.params as any;const info=db.prepare('UPDATE elements SET deleted_at=NULL WHERE id=? AND user_id=? AND deleted_at IS NOT NULL').run(Number(p.id),Number(p.userId));if(!info.changes)return reply.status(404).send({message:'Nie znaleziono usuniętego elementu.'});return{ok:true};});
  app.delete('/api/admin/users/:userId/routines/:id', adminAuth, async (request,reply) => {const p=request.params as any;const info=db.prepare("UPDATE routines SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND deleted_at IS NULL").run(Number(p.id),Number(p.userId));if(!info.changes)return reply.status(404).send({message:'Nie znaleziono aktywnego układu.'});return{ok:true};});
  app.post('/api/admin/users/:userId/routines/:id/restore', adminAuth, async (request,reply) => {const p=request.params as any;const info=db.prepare('UPDATE routines SET deleted_at=NULL WHERE id=? AND user_id=? AND deleted_at IS NOT NULL').run(Number(p.id),Number(p.userId));if(!info.changes)return reply.status(404).send({message:'Nie znaleziono usuniętego układu.'});return{ok:true};});

  app.get('/api/coach/invitations', auth, async request => db.prepare(`SELECT i.id,i.role,u.username creatorUsername,
    i.created_at createdAt,i.expires_at expiresAt,i.used_at acceptedAt,i.cancelled_at cancelledAt,
    CASE WHEN i.cancelled_at IS NOT NULL THEN 'cancelled' WHEN i.used_at IS NOT NULL THEN 'accepted'
      WHEN i.expires_at<=datetime('now') THEN 'expired' ELSE 'pending' END status
    FROM invitations i JOIN users u ON u.id=i.creator_id WHERE i.creator_id=? ORDER BY i.id DESC`).all(request.userId));
  app.post('/api/coach/invitations', auth, async (request,reply) => {
    const b=request.body as any;
    if(!['athlete','coach'].includes(b?.role)) return reply.status(400).send({message:'Wybierz profil zawodnika albo trenera.'});
    const role=b.role as 'athlete'|'coach';
    const profile=db.prepare('SELECT athlete_enabled,coach_enabled FROM users WHERE id=?').get(request.userId) as any;
    if((role==='coach'&&!profile.coach_enabled)||(role==='athlete'&&!profile.athlete_enabled)) return reply.status(403).send({message:'Najpierw aktywuj odpowiedni profil.'});
    const expiresInHours=b.expiresInHours===undefined?24:Number(b.expiresInHours);
    if(!Number.isInteger(expiresInHours)||expiresInHours<1||expiresInHours>72)return reply.status(400).send({message:'Ważność zaproszenia musi wynosić od 1 do 72 godzin.'});
    const token=randomBytes(24).toString('base64url'); const shortCode=randomBytes(4).toString('hex').toUpperCase();
    const id=Number(db.prepare("INSERT INTO invitations(creator_id,role,token_hash,short_code_hash,expires_at) VALUES(?,?,?,?,datetime('now',?))").run(request.userId,role,hashToken(token),hashToken(shortCode),`+${expiresInHours} hours`).lastInsertRowid);
    const row=db.prepare('SELECT created_at createdAt,expires_at expiresAt FROM invitations WHERE id=?').get(id) as any;
    const path=`/zaproszenie/${token}`;
    const url=`${request.protocol}://${request.headers.host ?? '127.0.0.1'}${path}`;
    const qrDataUrl=await QRCode.toDataURL(url,{margin:1,width:280});
    return reply.status(201).send({id,role,token,shortCode,path,url,qrDataUrl,expiresInHours,...row,status:'pending'});
  });
  app.get('/api/coach/invitations/preview', { ...auth, config:{rateLimit:{max:20,timeWindow:'5 minutes'}} }, async (request,reply) => {
    const q=request.query as any; const credential=text(q.token??q.shortCode??q.credential,'Kod zaproszenia');
    const invitation=findPendingInvitation(db,credential);
    if(!invitation)return reply.status(404).send({message:'Zaproszenie jest nieprawidłowe lub wygasło.'});
    if(invitation.creator_id===request.userId)return reply.status(400).send({message:'Nie możesz użyć własnego zaproszenia.'});
    return {id:invitation.id,role:invitation.role,creatorUsername:invitation.creator_username,expiresAt:invitation.expires_at,
      requiredProfile:invitation.role==='athlete'?'coach':'athlete'};
  });
  app.delete('/api/coach/invitations/:id', auth, async (request,reply) => {
    const id=Number((request.params as any).id);
    const info=db.prepare("UPDATE invitations SET cancelled_at=CURRENT_TIMESTAMP WHERE id=? AND creator_id=? AND used_at IS NULL AND cancelled_at IS NULL AND expires_at>datetime('now')").run(id,request.userId);
    if(!info.changes)return reply.status(404).send({message:'Nie znaleziono aktywnego zaproszenia.'});
    return {ok:true};
  });
  app.post('/api/coach/invitations/accept', { ...auth, config:{rateLimit:{max:10,timeWindow:'15 minutes'}} }, async (request,reply) => {
    const b=request.body as any; const credential=text(b.token??b.shortCode,'Kod zaproszenia');
    const invitation=findPendingInvitation(db,credential);
    if(!invitation)return reply.status(404).send({message:'Zaproszenie jest nieprawidłowe lub wygasło.'});
    if(invitation.creator_id===request.userId)return reply.status(400).send({message:'Nie możesz połączyć konta z samym sobą.'});
    const athleteId=invitation.role==='athlete'?invitation.creator_id:request.userId; const coachId=invitation.role==='coach'?invitation.creator_id:request.userId;
    const athlete=db.prepare('SELECT athlete_enabled FROM users WHERE id=? AND deleted_at IS NULL').get(athleteId) as any;
    const coach=db.prepare('SELECT coach_enabled FROM users WHERE id=? AND deleted_at IS NULL').get(coachId) as any;
    if(!athlete?.athlete_enabled||!coach?.coach_enabled)return reply.status(400).send({message:'Oba wymagane profile muszą być aktywne.'});
    const connected=db.transaction(()=>{
      const claimed=db.prepare("UPDATE invitations SET used_at=CURRENT_TIMESTAMP,accepted_by_id=? WHERE id=? AND used_at IS NULL AND cancelled_at IS NULL AND expires_at>datetime('now')").run(request.userId,invitation.id);
      if(!claimed.changes)return false;
      db.prepare('INSERT OR IGNORE INTO coach_links(athlete_id,coach_id) VALUES(?,?)').run(athleteId,coachId);
      return true;
    })();
    if(!connected)return reply.status(409).send({message:'To zaproszenie zostało już wykorzystane.'});
    return {ok:true,athleteId,coachId};
  });
  app.get('/api/coach/athletes', auth, async (request,reply) => {
    if(!hasEnabledProfile(db,request.userId,'coach'))return reply.status(403).send({message:'Najpierw aktywuj profil trenera.'});
    return db.prepare(`SELECT u.id,u.username,cl.created_at connectedAt FROM coach_links cl JOIN users u ON u.id=cl.athlete_id WHERE cl.coach_id=? AND u.deleted_at IS NULL AND u.athlete_enabled=1 ORDER BY u.username`).all(request.userId);
  });
  app.delete('/api/coach/links/:athleteId', auth, async request => { const athleteId=Number((request.params as any).athleteId);const info=db.prepare('DELETE FROM coach_links WHERE athlete_id=? AND coach_id=?').run(athleteId,request.userId);if(!info.changes)throw new Error('Nie znaleziono połączenia.');return{ok:true}; });
  app.get('/api/athlete/coaches', auth, async (request,reply) => {
    if(!hasEnabledProfile(db,request.userId,'athlete'))return reply.status(403).send({message:'Najpierw aktywuj profil zawodnika.'});
    return db.prepare(`SELECT u.id,u.username,cl.created_at connectedAt FROM coach_links cl JOIN users u ON u.id=cl.coach_id WHERE cl.athlete_id=? AND u.deleted_at IS NULL AND u.coach_enabled=1 ORDER BY u.username`).all(request.userId);
  });
  app.delete('/api/athlete/coaches/:coachId', auth, async request => { const coachId=Number((request.params as any).coachId);const info=db.prepare('DELETE FROM coach_links WHERE athlete_id=? AND coach_id=?').run(request.userId,coachId);if(!info.changes)throw new Error('Nie znaleziono połączenia.');return{ok:true}; });
  app.get('/api/coach/athletes/:athleteId', auth, async (request,reply) => {const athleteId=Number((request.params as any).athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return coachDenied(reply);return db.prepare('SELECT id,username FROM users WHERE id=?').get(athleteId);});
  app.get('/api/coach/athletes/:athleteId/elements', auth, async (request,reply) => {const athleteId=Number((request.params as any).athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return coachDenied(reply);return listElements(db,athleteId);});
  app.get('/api/coach/athletes/:athleteId/execution-types', auth, async (request,reply) => {const athleteId=Number((request.params as any).athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return coachDenied(reply);return db.prepare('SELECT id,name,sort_order sortOrder,hidden FROM execution_types WHERE user_id=? AND deleted_at IS NULL ORDER BY sort_order,id').all(athleteId);});
  app.get('/api/coach/athletes/:athleteId/routines', auth, async (request,reply) => {const athleteId=Number((request.params as any).athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return coachDenied(reply);return listRoutines(db,athleteId);});
  app.get('/api/coach/athletes/:athleteId/trainings', auth, async (request,reply) => { const athleteId=Number((request.params as any).athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return coachDenied(reply); const q=request.query as any;const conditions=['t.user_id=?'];const values:any[]=[athleteId];if(q.from){conditions.push('t.training_date>=?');values.push(q.from)}if(q.to){conditions.push('t.training_date<=?');values.push(q.to)}return listTrainings(db,conditions,values); });
  app.get('/api/coach/athletes/:athleteId/trainings/:id', auth, async (request,reply) => { const p=request.params as any;const athleteId=Number(p.athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return reply.status(403).send({message:'Brak dostępu do danych zawodnika.'});const item=getTraining(db,athleteId,Number(p.id));return item??reply.status(404).send({message:'Nie znaleziono treningu.'}); });
  app.get('/api/coach/athletes/:athleteId/stats', auth, async (request,reply) => { const athleteId=Number((request.params as any).athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return coachDenied(reply);const q=request.query as any;let elementId:number|undefined;if(q.elementId!==undefined){elementId=integerQuery(q.elementId,'Element');if(!db.prepare('SELECT 1 FROM elements WHERE id=? AND user_id=?').get(elementId,athleteId))return reply.status(404).send({message:'Nie znaleziono elementu.'});}return trainingSummary(db,athleteId,q.from,q.to,elementId); });
  app.get('/api/coach/athletes/:athleteId/elements/:elementId/history', auth, async (request,reply) => {const p=request.params as any;const athleteId=Number(p.athleteId);if(!hasCoachAccess(db,athleteId,request.userId))return coachDenied(reply);return coachElementHistory(db,athleteId,Number(p.elementId),reply);});

  const webRoot=resolve(fileURLToPath(new URL('../../../packages/web/dist',import.meta.url)));
  if(existsSync(webRoot)){await app.register(staticPlugin,{root:webRoot});app.setNotFoundHandler((request,reply)=>{if(!request.url.startsWith('/api/'))return reply.sendFile('index.html');return reply.status(404).send({message:'Nie znaleziono zasobu.'});});}
  return app;
}

function createSession(db:Db,userId:number,reply:any){const token=randomBytes(32).toString('base64url');db.prepare("DELETE FROM sessions WHERE expires_at<=datetime('now')").run();db.prepare("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,datetime('now','+30 days'))").run(userId,hashToken(token));reply.setCookie('acronote_session',token,{httpOnly:true,sameSite:'strict',secure:false,path:'/',maxAge:60*60*24*30});}
function publicUser(user:any){return{id:user.id,username:user.username,athleteEnabled:!!user.athlete_enabled,coachEnabled:!!user.coach_enabled,role:user.role??'user',isAdmin:user.role==='admin'};}
function integerQuery(value:unknown,label:string){const result=Number(value);if(!Number.isInteger(result)||result<0)throw new Error(`${label} jest nieprawidłowa.`);return result;}
function elementUsage(db:Db,userId:number,id:number){const element=db.prepare('SELECT id FROM elements WHERE id=? AND user_id=? AND deleted_at IS NULL').get(id,userId);if(!element)throw new Error('Nie znaleziono elementu.');const routines=db.prepare(`SELECT DISTINCT r.id,r.name FROM routine_items ri JOIN routines r ON r.id=ri.routine_id WHERE ri.element_id=? AND r.user_id=? AND r.deleted_at IS NULL ORDER BY r.name`).all(id,userId);return{usedInRoutines:routines.length>0,routineCount:routines.length,routines};}
function adminUser(db:Db,id:number){return db.prepare(`SELECT u.id,u.username,u.role,u.athlete_enabled athleteEnabled,u.coach_enabled coachEnabled,u.created_at createdAt,u.deleted_at deletedAt,
  (SELECT COUNT(*) FROM elements e WHERE e.user_id=u.id AND e.deleted_at IS NULL) elementsCount,(SELECT COUNT(*) FROM routines r WHERE r.user_id=u.id AND r.deleted_at IS NULL) routinesCount,(SELECT COUNT(*) FROM trainings t WHERE t.user_id=u.id) trainingsCount FROM users u WHERE u.id=?`).get(id);}
function listRoutines(db:Db,userId:number,id?:number){const rows=db.prepare(`SELECT id,name,template_version templateVersion,slot_count slotCount FROM routines WHERE user_id=? AND deleted_at IS NULL ${id?'AND id=?':''} ORDER BY name`).all(...(id?[userId,id]:[userId])) as any[];for(const row of rows)row.items=db.prepare(`SELECT ri.position,ri.element_id elementId,COALESCE(e.code,ri.code_snapshot) code,COALESCE(e.name,ri.name_snapshot) name FROM routine_items ri LEFT JOIN elements e ON e.id=ri.element_id AND e.deleted_at IS NULL WHERE routine_id=? ORDER BY position`).all(row.id);return rows;}
function saveRoutine(db:Db,userId:number,b:any,id?:number){const name=text(b.name,'Nazwa układu');const slotCount=Math.max(1,Math.min(100,Number(b.slotCount??10)));const items=Array.isArray(b.items)?b.items:[];return db.transaction(()=>{if(id){const info=db.prepare('UPDATE routines SET name=?,slot_count=?,template_version=template_version+1 WHERE id=? AND user_id=? AND deleted_at IS NULL').run(name,slotCount,id,userId);if(!info.changes)throw new Error('Nie znaleziono układu.');db.prepare('DELETE FROM routine_items WHERE routine_id=?').run(id);}else id=Number(db.prepare('INSERT INTO routines(user_id,name,slot_count) VALUES(?,?,?)').run(userId,name,slotCount).lastInsertRowid);const insert=db.prepare('INSERT INTO routine_items(routine_id,position,element_id,code_snapshot,name_snapshot) VALUES(?,?,?,?,?)');items.forEach((item:any,index:number)=>{let code=item.code,nameValue=item.name??null;if(item.elementId){const element=db.prepare('SELECT code,name FROM elements WHERE id=? AND user_id=? AND deleted_at IS NULL').get(item.elementId,userId) as any;if(!element)throw new Error('Wybrany element nie istnieje.');code=element.code;nameValue=element.name;}insert.run(id,index+1,item.elementId??null,text(code,'Kod elementu'),nameValue);});return id!;})();}
function hasEnabledProfile(db:Db,userId:number,profile:'athlete'|'coach'){const column=profile==='athlete'?'athlete_enabled':'coach_enabled';return Boolean(db.prepare(`SELECT 1 FROM users WHERE id=? AND deleted_at IS NULL AND ${column}=1`).get(userId));}
function hasCoachAccess(db:Db,athleteId:number,coachId:number){return Boolean(db.prepare(`SELECT 1 FROM coach_links cl JOIN users a ON a.id=cl.athlete_id JOIN users c ON c.id=cl.coach_id
  WHERE cl.athlete_id=? AND cl.coach_id=? AND a.deleted_at IS NULL AND c.deleted_at IS NULL AND a.athlete_enabled=1 AND c.coach_enabled=1`).get(athleteId,coachId));}
function coachDenied(reply:any){return reply.status(403).send({message:'Brak dostępu do danych zawodnika.'});}
function findPendingInvitation(db:Db,credential:string){return db.prepare(`SELECT i.id,i.creator_id,i.role,i.expires_at,u.username creator_username FROM invitations i JOIN users u ON u.id=i.creator_id
  WHERE (i.token_hash=? OR i.short_code_hash=?) AND i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at>datetime('now') AND u.deleted_at IS NULL`).get(hashToken(credential),hashToken(credential.toUpperCase())) as any;}
function listElements(db:Db,userId:number){return db.prepare(`SELECT id,code,name,favorite,hidden,quarter_count quarterCount,salto_count saltoCount,total_twist_halves/2.0 totalTwists,direction,position_symbol positionSymbol
  FROM elements WHERE user_id=? AND deleted_at IS NULL ORDER BY favorite DESC,code`).all(userId);}
function listTrainings(db:Db,conditions:string[],values:any[]){return db.prepare(`SELECT t.id,t.training_date date,t.created_at createdAt,t.updated_at updatedAt,
  (SELECT COUNT(*) FROM training_entries te WHERE te.training_id=t.id) entriesCount,
  COALESCE((SELECT SUM(CASE WHEN a.kind='element' THEN a.repetitions ELSE a.repetitions*(SELECT COUNT(*) FROM activity_elements ae WHERE ae.activity_id=a.id) END) FROM training_entries te JOIN activities a ON a.entry_id=te.id WHERE te.training_id=t.id),0) totalElements
  FROM trainings t WHERE ${conditions.join(' AND ')} ORDER BY t.training_date DESC,t.id DESC`).all(...values);}
function elementHistory(db:Db,userId:number,id:number,reply:any){
  const element=db.prepare('SELECT id,code,name FROM elements WHERE id=? AND user_id=?').get(id,userId) as any;
  if(!element)return reply.status(404).send({message:'Nie znaleziono elementu.'});
  const direct=db.prepare(`SELECT t.id trainingId,t.training_date date,SUM(a.repetitions) count FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id WHERE t.user_id=? AND a.kind='element' AND a.source_element_id=? GROUP BY t.id`).all(userId,id) as any[];
  const nested=db.prepare(`SELECT t.id trainingId,t.training_date date,SUM(a.repetitions) count FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id JOIN activity_elements ae ON ae.activity_id=a.id WHERE t.user_id=? AND ae.source_element_id=? GROUP BY t.id`).all(userId,id) as any[];
  const map=new Map<number,any>();for(const row of [...direct,...nested]){const old=map.get(row.trainingId);map.set(row.trainingId,{trainingId:row.trainingId,date:row.date,count:Number(row.count)+(old?.count??0)});}const trainings=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const group=(format:string)=>db.prepare(`SELECT strftime('${format}',t.training_date) period,SUM(x.count) count FROM (SELECT te.training_id,SUM(a.repetitions) count FROM training_entries te JOIN activities a ON a.entry_id=te.id WHERE a.kind='element' AND a.source_element_id=? GROUP BY te.training_id UNION ALL SELECT te.training_id,SUM(a.repetitions) count FROM training_entries te JOIN activities a ON a.entry_id=te.id JOIN activity_elements ae ON ae.activity_id=a.id WHERE ae.source_element_id=? GROUP BY te.training_id) x JOIN trainings t ON t.id=x.training_id WHERE t.user_id=? GROUP BY period ORDER BY period`).all(id,id,userId);
  return {element,trainings,weeks:group('%Y-W%W'),months:group('%Y-%m')};
}
function coachElementHistory(db:Db,userId:number,id:number,reply:any){
  if(!db.prepare('SELECT 1 FROM elements WHERE id=? AND user_id=?').get(id,userId))return reply.status(404).send({message:'Nie znaleziono elementu.'});
  const direct=db.prepare(`SELECT t.id trainingId,t.training_date date,a.execution_type_name landing,SUM(a.repetitions) count
    FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id
    WHERE t.user_id=? AND a.kind='element' AND a.source_element_id=? GROUP BY t.id,a.execution_type_name`).all(userId,id) as any[];
  const nested=db.prepare(`SELECT t.id trainingId,t.training_date date,ae.execution_type_name landing,SUM(a.repetitions) count
    FROM trainings t JOIN training_entries te ON te.training_id=t.id JOIN activities a ON a.entry_id=te.id JOIN activity_elements ae ON ae.activity_id=a.id
    WHERE t.user_id=? AND ae.source_element_id=? GROUP BY t.id,ae.execution_type_name`).all(userId,id) as any[];
  const map=new Map<number,{trainingId:number;date:string;count:number;landingMap:Map<string,number>}>();
  for(const row of [...direct,...nested]){const item=map.get(row.trainingId)??{trainingId:row.trainingId,date:row.date,count:0,landingMap:new Map<string,number>()};const count=Number(row.count);item.count+=count;item.landingMap.set(row.landing,(item.landingMap.get(row.landing)??0)+count);map.set(row.trainingId,item);}
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.trainingId-b.trainingId).map(({landingMap,...item})=>({...item,landings:[...landingMap.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pl'))}));
}
