import { readdirSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const scripts=['server.mjs','security.mjs','check.mjs','public/app.js',...readdirSync('tests').filter(x=>x.endsWith('.mjs')).map(x=>join('tests',x))];
for (const script of scripts) {
  const result=spawnSync(process.execPath,['--check',script],{stdio:'inherit'});
  if(result.status!==0) process.exit(1);
}
console.log('Sintaxe validada em '+scripts.length+' arquivos JavaScript.');
if(process.argv.includes('--build')){
  mkdirSync('dist',{recursive:true});
  for(const path of ['public','server.mjs','security.mjs','schema.sql','.env.example','README.md','docs']) cpSync(path,join('dist',path),{recursive:true});
  console.log('Aplicação empacotada em dist/.');
}

