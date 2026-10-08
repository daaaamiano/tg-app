import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTelegramConfig, serviceOrigin, telegramConfigFromEnv } from './telegramConfig';
import { validatePrivateBuild } from './privateService';

afterEach(()=>vi.unstubAllEnvs());
describe('private service configuration',()=>{
  it('requires exact HTTPS origins in production and only loopback HTTP in development',()=>{
    expect(serviceOrigin('https://private.example/',true)).toBe('https://private.example');
    expect(serviceOrigin('http://127.0.0.1:5180',false)).toBe('http://127.0.0.1:5180');
    for (const value of [undefined,'http://private.example','https://user:password@private.example','https://private.example/path','https://private.example?origin=other','https://private.example/#fragment'])
      expect(()=>serviceOrigin(value,true)).toThrow();
    expect(()=>serviceOrigin('http://0.0.0.0:5180',false)).toThrow();
  });
  it('validates private settings and defaults the public login client ID to the bot ID',()=>{
    const env={TELEGRAM_BOT_TOKEN:'123456789:test-only',TELEGRAM_GROUP_ID:'-123'};
    expect(telegramConfigFromEnv(env).loginClientId).toBe('123456789');
    expect(()=>telegramConfigFromEnv({...env,TELEGRAM_BOT_TOKEN:'malformed'})).toThrow('TELEGRAM_BOT_TOKEN');
    expect(()=>telegramConfigFromEnv({...env,TELEGRAM_GROUP_ID:'public-name'})).toThrow('TELEGRAM_GROUP_ID');
  });
  it('never loads developer credentials from an env file in production',()=>{
    const root=mkdtempSync(join(tmpdir(),'ropelab-config-test-'));
    try {
      writeFileSync(join(root,'.env.server.local'),'TELEGRAM_BOT_TOKEN=123456789:test-only\nTELEGRAM_GROUP_ID=-123\n');
      vi.stubEnv('TELEGRAM_BOT_TOKEN',''); vi.stubEnv('TELEGRAM_GROUP_ID','');
      expect(()=>readTelegramConfig(root,true)).toThrow('TELEGRAM_BOT_TOKEN');
    } finally {rmSync(root,{recursive:true,force:true});}
  });
  it('refuses a plain public build and accepts the private build marker',()=>{
    const root=mkdtempSync(join(tmpdir(),'ropelab-build-test-'));
    try {
      expect(()=>validatePrivateBuild(root)).toThrow('build:service');
      writeFileSync(join(root,'.private-service.json'),JSON.stringify({privateService:true}));
      expect(()=>validatePrivateBuild(root)).not.toThrow();
    } finally {rmSync(root,{recursive:true,force:true});}
  });
});
