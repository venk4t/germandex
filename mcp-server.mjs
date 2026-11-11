import {McpServer,createMcpHandler} from '@modelcontextprotocol/server';
import {z} from 'zod';
export const CITIES={aachen:'Aachen',berlin:'Berlin',bochum:'Bochum',dortmund:'Dortmund',duesseldorf:'Düsseldorf',frankfurt:'Frankfurt',hamburg:'Hamburg',koeln:'Cologne',muenchen:'Munich',muenster:'Münster',erlangen:'Erlangen',tuebingen:'Tübingen'};
export const SECTIONS={admin:'Arrival and university setup',housing:'Housing',medical:'Medical help',sports:'Student sports',restaurants:'Restaurants',party:'Nightlife',groceries:'Groceries'};
export const SHARED=['/money','/job','/job/resume','/job/reference','/germany/language','/germany/etiquette','/germany/delivery','/germany/admin','/germany/housing','/germany/groceries','/manifesto','/terms','/privacy'];
export const LANGUAGES=['en','fr','pt','es','id','tr','hr','sl','zh','hi','ta','th'];
const routes=new Set(['/',...SHARED,...Object.keys(CITIES).flatMap(c=>Object.keys(SECTIONS).map(s=>`/${c}/${s}`))]);
const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const json=x=>({content:[{type:'text',text:JSON.stringify(x)}],structuredContent:x});
export function createServer(env,origin){
 const server=new McpServer({name:'germandex',version:'1.0.0'},{instructions:'Read-only public student guides to Germany. Sources are guidance, not independently verified legal, medical, tax or financial advice. Cite sourceUrl and verify official sources for decisions. Translations are not native-reviewed.'});
 server.registerTool('list_cities',{description:'List the ten supported German student cities and their guide entry points.',inputSchema:z.object({}),annotations},async()=>json({cities:Object.entries(CITIES).map(([id,name])=>({id,name,sourceUrl:`https://germandex.com/${id}/admin`}))}));
 server.registerTool('list_sections',{description:'List city sections, Germany-wide guides and supported language codes. Optionally choose a supported city.',inputSchema:z.object({city:z.enum(Object.keys(CITIES)).optional()}),annotations},async({city})=>json({city:city||null,citySections:Object.entries(SECTIONS).map(([id,name])=>({id,name,...(city?{route:`/${city}/${id}`,sourceUrl:`https://germandex.com/${city}/${id}`}:{})})),sharedGuides:SHARED.map(route=>({route,sourceUrl:'https://germandex.com'+route})),languages:LANGUAGES}));
 server.registerTool('get_guide',{description:'Fetch a single published guide as Markdown. Use a route returned by list_sections, / for the homepage, and an optional language code. Only known public guide routes are allowed; legal pages are English-only.',inputSchema:z.object({route:z.string().max(80),language:z.enum(LANGUAGES).default('en')}),annotations},async({route,language})=>{
  if(!routes.has(route))return {isError:true,content:[{type:'text',text:'Unknown guide route. Use list_sections to find a supported route.'}]};
  if(language!=='en'&&['/terms','/privacy'].includes(route))return {isError:true,content:[{type:'text',text:'Terms and privacy are available only in English.'}]};
  const prefix=language==='en'?'':'/'+language;
  const file=prefix+(route==='/'?'/index.md':route+'.md');
  try{
   const res=await env.ASSETS.fetch(new Request(new URL(file,origin)));
   if(!res.ok||(res.headers.get('content-type')||'').includes('text/html'))throw Error('Missing guide asset');
   const markdown=await res.text();
   if(!markdown.startsWith('# ')||markdown.length>250000)throw Error('Invalid guide asset');
   return json({route,language,sourceUrl:'https://germandex.com'+(prefix+ (route==='/'?'':route)||'/'),markdownUrl:'https://germandex.com'+file,markdown,notice:'Guidance only. Check official sources for legal, medical, tax and financial decisions. Translations are not native-reviewed.'});
  }catch{return {isError:true,content:[{type:'text',text:'Guide unavailable. Please try later or open the public guide website.'}]};}
 });
 return server;
}
export async function handleMcp(request,env){
 const url=new URL(request.url);
 const hosts=['germandex.com','www.germandex.com','germandex.pages.dev','seo-fixes.germandex.pages.dev','localhost','127.0.0.1'];
 if(!hosts.includes(url.hostname)&&!url.hostname.endsWith('.germandex.pages.dev'))return new Response('Forbidden',{status:403});
 const origin=request.headers.get('origin');
 // Same-site browser clients only. Non-browser MCP clients send no Origin.
 if(origin&&origin!==url.origin)return new Response('Origin not allowed',{status:403});
 const headers={'access-control-allow-origin':url.origin,'access-control-allow-methods':'POST, GET, DELETE, OPTIONS','access-control-allow-headers':'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Mcp-Method, Mcp-Name','access-control-expose-headers':'MCP-Session-Id','vary':'Origin','cache-control':'no-store','x-content-type-options':'nosniff'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method==='POST'){
  const len=Number(request.headers.get('content-length'));
  if(len>16384)return new Response('Request too large',{status:413,headers});
  // Bound actual bytes, including requests without Content-Length.
  const reader=request.body?.getReader();let bytes=0;const chunks=[];
  if(reader){for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>16384){await reader.cancel();return new Response('Request too large',{status:413,headers});}chunks.push(value);}}
  const body=new Uint8Array(bytes);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}
  request=new Request(request.url,{method:request.method,headers:request.headers,body});
 }
 try{
  const handler=createMcpHandler(()=>createServer(env,url.origin),{legacy:'stateless',responseMode:'json',maxSubscriptions:0});
  const res=await handler.fetch(request);const h=new Headers(res.headers);for(const[k,v]of Object.entries(headers))h.set(k,v);return new Response(res.body,{status:res.status,headers:h});
 }catch{return new Response('MCP service unavailable',{status:503,headers});}
}
