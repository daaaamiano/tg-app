import { createHmac } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createPrivateService } from './privateService';
import { AuthStorageError, createDatabaseAuthStorage } from './authStorage';
import pg from 'pg';
import type { GroupAccess } from './groupAccess';

const origin = 'https://private.example';
const token = '123456789:test-secret-only';
const dist = mkdtempSync(join(tmpdir(), 'ropelab-service-test-'));
mkdirSync(join(dist, 'assets'));
writeFileSync(join(dist, 'index.html'), '<html>PRIVATE_EVENT_FIXTURE</html>');
writeFileSync(join(dist, 'assets', 'event.js'), 'PRIVATE_EVENT_BUNDLE_FIXTURE');
writeFileSync(join(dist, 'poster.jpg'), 'PRIVATE_POSTER_FIXTURE');
writeFileSync(join(dist, 'signin.js'), 'fetch("/api/telegram/session")');
afterAll(() => rmSync(dist, { recursive: true, force: true }));

function setup(storage: Partial<Parameters<typeof createPrivateService>[0]> = {}) {
  const rosterLoader = vi.fn().mockResolvedValue({ title:'Test', members:[], totalMembers:0, complete:true, checkedAt:new Date().toISOString() });
  const app = createPrivateService({ origin, dist, secureCookies:true, config:{token,chatId:'-123',loginClientId:'123456789'}, rosterLoader, ...storage });
  function get(path: string, cookie?: string) {
    const req = request(app).get(path).set('Host','private.example');
    return cookie ? req.set('Cookie',cookie) : req;
  }
  async function login(id: number) {
    const fields = { auth_date: String(Math.floor(Date.now()/1000)), user:JSON.stringify({id,first_name:'Test user'}) };
    const check = Object.entries(fields).map(([key,value])=>`${key}=${value}`).join('\n');
    const key = createHmac('sha256','WebAppData').update(token).digest();
    const initData = new URLSearchParams({...fields,hash:createHmac('sha256',key).update(check).digest('hex')}).toString();
    const response = await request(app).post('/api/telegram/authenticate').set('Host','private.example').set('Origin',origin).send({initData});
    expect(response.status).toBe(200);
    return {response,cookie:response.headers['set-cookie'][0].split(';')[0] as string};
  }
  return {app,get,login,rosterLoader};
}

describe('hosted private service', () => {
  it('admits authorized attendees to events while keeping group lists, approvals and rosters admin-only', async () => {
    let allowed = true;
    const groups: GroupAccess = { list: vi.fn().mockResolvedValue([]), setApproval: vi.fn(), hasGroup: vi.fn().mockResolvedValue(true), canViewEvents: vi.fn(async () => allowed) };
    const { app, get, login } = setup({groups});
    expect((await get('/api/telegram/groups')).status).toBe(401);
    const {cookie,response} = await login(234);
    expect(response.body.session.canViewEvents).toBe(true);
    expect((await get('/assets/event.js',cookie)).status).toBe(200);
    expect((await get('/api/telegram/groups',cookie)).status).toBe(403);
    expect((await get('/api/telegram/group-members?chatId=-123',cookie)).status).toBe(403);
    const post = (cookie: string, value: object) => request(app).post('/api/telegram/group-approval').set('Host','private.example').set('Origin',origin).set('Cookie',cookie).send(value);
    expect((await post(cookie,{chatId:'-123',approved:true})).status).toBe(403);
    expect(groups.setApproval).not.toHaveBeenCalled();
    allowed = false;
    expect((await get('/assets/event.js',cookie)).status).toBe(403);
    expect((await get('/api/telegram/session',cookie)).body.session.canViewEvents).toBe(false);
    const admin = await login(17666600);
    expect((await get('/api/telegram/groups',admin.cookie)).status).toBe(200);
    expect((await post(admin.cookie,{chatId:'-123',approved:'true'})).status).toBe(400);
    expect((await post(admin.cookie,{chatId:'-123',approved:true})).status).toBe(200);
    expect(groups.setApproval).toHaveBeenCalledWith('-123',true,17666600,expect.any(Function));
  });

  it('withholds an attendee file if logout occurs during the membership lookup', async () => {
    let block = false;
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => {release=resolve;});
    const checking = new Promise<void>(resolve => {entered=resolve;});
    const groups: GroupAccess = {list:async()=>[],setApproval:async()=>{},hasGroup:async()=>false,canViewEvents:async()=>{if(block){entered();await waiting;}return true;}};
    const {app,get,login} = setup({groups});
    const {cookie} = await login(234);
    block = true;
    const pending = get('/assets/event.js',cookie).then(response=>response);
    await checking;
    await request(app).post('/api/telegram/logout').set('Host','private.example').set('Origin',origin).set('Cookie',cookie);
    release();
    expect((await pending).status).toBe(403);
  });
  it('serves only a generic sign-in shell and public login code to visitors', async () => {
    const {get} = setup();
    const root = await get('/');
    expect(root.status).toBe(200);
    expect(root.text).toContain('Sign in with Telegram');
    expect(root.text).not.toContain('PRIVATE_EVENT');
    expect(root.text).not.toContain('17666600');
    expect(root.headers['cache-control']).toBe('private, no-store');
    expect((await get('/signin.js')).text).toContain('/api/telegram/');
    expect((await get('/').set('Sec-Fetch-Site','cross-site').set('Sec-Fetch-Mode','navigate')).status).toBe(200);
    expect(root.headers['content-security-policy']).toContain("frame-ancestors 'self' https://web.telegram.org");
  });

  it('denies unauthenticated requests for bundles, posters, members, and source paths', async () => {
    const {get,rosterLoader} = setup();
    for (const path of ['/assets/event.js','/poster.jpg','/.env.server.local','/server/telegramAuth.ts','/api/telegram/group-members?chatId=-123']) {
      const response = await get(path);
      expect(response.status).toBe(401);
      expect(response.text).not.toContain('PRIVATE_');
    }
    expect(rosterLoader).not.toHaveBeenCalled();
  });

  it('withholds the frontend and members from other verified Telegram accounts', async () => {
    const {get,login,rosterLoader} = setup();
    const {cookie} = await login(123);
    for (const path of ['/','/assets/event.js','/poster.jpg','/api/telegram/group-members?chatId=-123']) {
      const response = await get(path,cookie);
      expect(response.status).toBe(403);
      expect(response.text).not.toContain('PRIVATE_EVENT');
      expect(response.text).not.toContain('PRIVATE_POSTER');
    }
    expect(rosterLoader).not.toHaveBeenCalled();
  });

  it('uses secure host cookies and allows only the verified admin to read private files and the roster', async () => {
    const {get,login} = setup();
    const {response,cookie} = await login(17666600);
    expect(response.body.session.isSystemAdmin).toBe(true);
    expect(cookie).toMatch(/^__Host-ropelab_telegram_session=/);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly; SameSite=None; Path=/;');
    expect(response.headers['set-cookie'][0]).toContain('; Secure');
    expect((await get('/',cookie)).text).toContain('PRIVATE_EVENT_FIXTURE');
    const bundle = await get('/assets/event.js',cookie);
    expect(bundle.text).toBe('PRIVATE_EVENT_BUNDLE_FIXTURE');
    expect(bundle.headers['cache-control']).toBe('private, no-store');
    expect((await get('/api/telegram/group-members?chatId=-123',cookie)).status).toBe(200);
    // Conditional cache headers do not bypass authorization after logout or expiry.
    const anonymousConditional = await get('/assets/event.js').set('If-None-Match',bundle.headers.etag);
    expect(anonymousConditional.status).toBe(401);
  });

  it('rejects hostile origins and Host/forwarded-host spoofing', async () => {
    const {app,get} = setup();
    expect((await get('/api/telegram/session').set('Origin','https://attacker.example')).status).toBe(403);
    expect((await request(app).get('/').set('Host','attacker.example').set('X-Forwarded-Host','private.example')).status).toBe(403);
    expect((await request(app).post('/api/telegram/logout').set('Host','private.example').send({})).status).toBe(403);
    expect((await get('/poster.jpg').set('Sec-Fetch-Site','cross-site')).status).toBe(403);
  });

  it('revokes both API and static-file access on logout', async () => {
    const {app,get,login} = setup();
    const {cookie} = await login(17666600);
    expect((await request(app).post('/api/telegram/logout').set('Host','private.example').set('Origin',origin).set('Cookie',cookie)).status).toBe(200);
    expect((await get('/api/telegram/session',cookie)).body.session).toBeNull();
    expect((await get('/assets/event.js',cookie)).status).toBe(401);
    expect((await get('/api/telegram/group-members?chatId=-123',cookie)).status).toBe(401);
  });

  it('returns only health status for hosting probes, regardless of internal Host', async () => {
    const {app} = setup();
    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ok:true});
  });

  (process.env.TEST_DATABASE_URL ? it : it.skip)('shares authenticated file/API access and logout between independent backend instances', async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    try {
    const query = (sql: string, values?: unknown[]) => pool.query(sql, values);
    const a = setup(createDatabaseAuthStorage(query, origin));
    const b = setup(createDatabaseAuthStorage(query, origin));
    const {cookie} = await a.login(17666600);
    expect((await b.get('/api/telegram/session',cookie)).body.session.isSystemAdmin).toBe(true);
    expect((await b.get('/assets/event.js',cookie)).text).toBe('PRIVATE_EVENT_BUNDLE_FIXTURE');
    expect((await request(b.app).post('/api/telegram/logout').set('Host','private.example').set('Origin',origin).set('Cookie',cookie)).status).toBe(200);
    expect((await a.get('/assets/event.js',cookie)).status).toBe(401);
    expect((await a.get('/api/telegram/group-members?chatId=-123',cookie)).status).toBe(401);
    } finally { await pool.end(); }
  });

  it('withholds private files and APIs with 503 when shared storage is unavailable', async () => {
    const storage = createDatabaseAuthStorage(async () => { throw new AuthStorageError(); }, origin);
    const {get, app, rosterLoader} = setup(storage);
    const cookie = '__Host-ropelab_telegram_session=' + 'a'.repeat(43);
    for (const path of ['/assets/event.js','/poster.jpg','/api/telegram/session','/api/telegram/group-members?chatId=-123']) {
      const response = await get(path,cookie);
      expect(response.status).toBe(503);
      expect(response.text).not.toContain('PRIVATE_');
    }
    expect((await request(app).post('/api/telegram/authenticate').set('Host','private.example').set('Origin',origin).send({initData:'bad'})).status).toBe(503);
    expect(rosterLoader).not.toHaveBeenCalled();
  });
});
