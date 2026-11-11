import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {handleMcp} from './mcp-server.mjs';
const env={ASSETS:{fetch:async request=>{try{return new Response(await fs.readFile(new URL(request.url).pathname.slice(1),'utf8'),{headers:{'content-type':'text/markdown'}})}catch{return new Response('Not found',{status:404})}}}};
const url='https://seo-fixes.germandex.pages.dev/mcp';
async function rpc(method,params={},extra={}){
 const r=await handleMcp(new Request(url,{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-11-25',...extra},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),env);
 const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=JSON.parse(text.split('\n').find(x=>x.startsWith('data: ')).slice(6))};return {r,body};
}
let x=await rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'germandex-test',version:'1'}});assert.equal(x.body.result.serverInfo.name,'germandex');console.log('initialize: passed');
x=await rpc('tools/list');assert.equal(x.body.result.tools.length,3);assert(x.body.result.tools.every(t=>t.annotations.readOnlyHint));console.log('tools/list: passed');
x=await rpc('tools/call',{name:'list_cities',arguments:{}});assert.equal(x.body.result.structuredContent.cities.length,12);console.log('list_cities: passed');
x=await rpc('tools/call',{name:'list_sections',arguments:{city:'aachen'}});assert.equal(x.body.result.structuredContent.citySections.length,7);console.log('list_sections: passed');
for(const[route,language]of [['/aachen/admin','en'],['/berlin/housing','fr'],['/germany/language','ta'],['/','en']]){x=await rpc('tools/call',{name:'get_guide',arguments:{route,language}});assert(x.body.result.structuredContent.markdown.startsWith('# '));console.log('get_guide',route,language,': passed');}
for(const route of ['/api/screenshot','/../../package.json','https://evil.invalid/']){x=await rpc('tools/call',{name:'get_guide',arguments:{route}});assert.equal(x.body.result.isError,true)}
console.log('Forbidden/non-guide routes: passed');
x=await rpc('tools/call',{name:'get_guide',arguments:{route:'/privacy',language:'fr'}});assert.equal(x.body.result.isError,true);
let r=await handleMcp(new Request(url,{method:'POST',headers:{origin:'https://evil.invalid'}}),env);assert.equal(r.status,403);r=await handleMcp(new Request(url,{method:'POST',body:'x'.repeat(20000)}),env);assert.equal(r.status,413);console.log('Origin and body limits: passed');
