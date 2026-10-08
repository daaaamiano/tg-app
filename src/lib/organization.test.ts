import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});
describe('private-service frontend transport',()=>{
  it('keeps ordinary static builds disconnected from administrator endpoints',async()=>{
    vi.stubEnv('DEV',false); vi.stubEnv('VITE_PRIVATE_SERVICE','false');
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const api=await import('./organization');
    expect(api.organizationAuthAvailable).toBe(false);
    expect(await api.getOrganizationSession()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the same-origin production API when built for the private service',async()=>{
    vi.stubEnv('DEV',false);vi.stubEnv('VITE_PRIVATE_SERVICE','true');
    const session={user:{id:17666600,first_name:'Test admin'},isSystemAdmin:true,expiresAt:Date.now()+10000};
    const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({session})});vi.stubGlobal('fetch',fetch);
    const api=await import('./organization');
    expect(api.telegramApiPrefix).toBe('/api/telegram/');
    expect(await api.getOrganizationSession()).toEqual(session);
    expect(fetch).toHaveBeenCalledWith('/api/telegram/session',expect.objectContaining({credentials:'same-origin',cache:'no-store'}));
  });
  it('preserves the isolated Vite endpoint for local development',async()=>{
    vi.stubEnv('DEV',true);vi.stubEnv('VITE_PRIVATE_SERVICE','false');vi.stubEnv('BASE_URL','/');
    const api=await import('./organization');
    expect(api.organizationAuthAvailable).toBe(true);
    expect(api.telegramApiPrefix).toBe('/__local/telegram/');
  });
});
