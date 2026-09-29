import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
// Matches the Sites starter's local-only D1 binding. Never targets a remote DB.
mkdirSync('.wrangler',{recursive:true});
writeFileSync('.wrangler/local-migrations.json',JSON.stringify({name:'heavy-ballers-local-migrations',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000',migrations_dir:resolve('drizzle')}]}));
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local','--config','.wrangler/local-migrations.json','--persist-to','.wrangler/state'],{stdio:'inherit'});
process.exit(result.status??1);
