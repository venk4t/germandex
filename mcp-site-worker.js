import {handleMcp} from './mcp-server.mjs';
const MAX=7*1024*1024, RETENTION=30*86400;
const hosts=new Set(['germandex.com','www.germandex.com','germandex.pages.dev']);
const j=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const hex=x=>Array.from(new Uint8Array(x)).map(x=>x.toString(16).padStart(2,'0')).join('');
async function sign(secret,value){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(value)));}
function equal(a,b){if(typeof a!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
function imageType(b){if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10)return 'image/png';if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';const s=String.fromCharCode(...b.slice(0,12));if(s.startsWith('GIF87a')||s.startsWith('GIF89a'))return 'image/gif';if(s.startsWith('RIFF')&&s.slice(8,12)==='WEBP')return 'image/webp';return null;}
async function boundedBody(request,limit){const r=request.body?.getReader();if(!r)throw Error('body');const chunks=[];let n=0;while(true){let x=await r.read();if(x.done)break;n+=x.value.length;if(n>limit){await r.cancel();throw Error('body too large');}chunks.push(x.value);}const out=new Uint8Array(n);let p=0;for(const x of chunks){out.set(x,p);p+=x.length;}return out;}
async function throttle(request,env,now){const day=new Date(now*1000).toISOString().slice(0,10);const ip=request.headers.get('CF-Connecting-IP')||'unknown';const digest=await sign(env.LINK_SECRET,day+':'+ip);await stmt(env.DB,'INSERT INTO attempts(key,hits) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET hits=hits+1',day+':'+digest).run();return day;}
async function download(request,env,url,now){const id=url.searchParams.get('id'),exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig')||'';
 if(!/^[0-9a-f-]{36}$/.test(id||'')||!Number.isSafeInteger(exp)||exp<now||exp>now+86400)return j({error:'Invalid or expired link'},403);
 if(!equal(sig,await sign(env.LINK_SECRET,id+':'+exp)))return j({error:'Invalid or expired link'},403);
 const row=await stmt(env.DB,"SELECT object_key,mime,expires_at FROM feedback WHERE id=? AND state IN ('stored','notified')",id).first();if(!row?.object_key||row.expires_at<now)return j({error:'Image expired'},404);
 const day=new Date(now*1000).toISOString().slice(0,10);
 try{await stmt(env.DB,'INSERT INTO daily(day,reads) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET reads=reads+1',day).run();}catch{return j({error:'Daily download limit reached'},429);}
 const obj=await env.SHOTS.get(row.object_key);if(!obj)return j({error:'Image expired'},404);
 return new Response(obj.body,{headers:{'content-type':row.mime,'content-disposition':'attachment; filename="feedback-screenshot"','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'referrer-policy':'no-referrer'}});
}
async function submit(request,env,url,now,ctx){
 const origin=request.headers.get('Origin');if(origin!==url.origin||!hosts.has(url.hostname))return j({error:'Forbidden'},403);
 if(!env.DB||!env.SHOTS||!env.TURNSTILE_SECRET||!env.LINK_SECRET)return j({error:'Feedback is not ready yet'},503);
 const length=Number(request.headers.get('content-length'));if(length>MAX+32768)return j({error:'Upload too large'},413);
 let day;try{day=await throttle(request,env,now);}catch{return j({error:'Please try again later'},429);}
 let form;try{const body=await boundedBody(request,MAX+32768);form=await new Response(body,{headers:{'content-type':request.headers.get('content-type')||''}}).formData();}catch{return j({error:'Invalid or oversized form'},400);}
 if(form.get('company'))return j({error:'Invalid submission'},400);
 const message=String(form.get('message')||'').trim(),email=String(form.get('email')||'').trim(),page=String(form.get('page')||''),language=String(form.get('language')||'en'),category=String(form.get('type')||'');
 if(!message||message.length>4000||email.length>200||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||page.length>1000||language.length>12||!['Suggest Edits','Improve Guide'].includes(category))return j({error:'Invalid fields'},400);
 let pageUrl;try{pageUrl=new URL(page);}catch{return j({error:'Invalid page'},400);}if(!hosts.has(pageUrl.hostname)||pageUrl.protocol!=='https:')return j({error:'Invalid page'},400);
 const id=String(form.get('submission-id')||'');if(!/^[0-9a-f-]{36}$/.test(id))return j({error:'Invalid submission ID'},400);
 const token=String(form.get('cf-turnstile-response')||'');if(!token||token.length>2048)return j({error:'Bot check required'},400);
 let validation;try{const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET,response:token,idempotency_key:id})});validation=await r.json();}catch{return j({error:'Bot check temporarily unavailable'},503);}
 if(!validation.success||validation.action!=='feedback'||validation.hostname!==url.hostname)return j({error:'Bot check failed'},403);
 const existing=await stmt(env.DB,'SELECT state FROM feedback WHERE id=?',id).first();if(existing)return ['stored','notified'].includes(existing.state)?j({ok:true,id}):j({error:'Previous attempt has not completed, reopen form'},409);
 const file=form.get('screenshot');let bytes=0,mime=null,data=null,key=null;
 if(file&&typeof file!=='string'&&file.size){if(file.size>MAX||category!=='Suggest Edits')return j({error:'Invalid screenshot'},400);data=new Uint8Array(await file.arrayBuffer());mime=imageType(data);if(!mime||mime!==file.type)return j({error:'Invalid image type'},400);bytes=data.length;key='screenshots/'+id;}
 const expires=now+RETENTION;
 // D1 batch is transactional. Quotas are reserved BEFORE any metered bucket call.
 try{await env.DB.batch([
 stmt(env.DB,'INSERT INTO daily(day,submissions) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET submissions=submissions+1',day),
 stmt(env.DB,'UPDATE ceiling SET reserved_bytes=reserved_bytes+? WHERE id=1',bytes),
 stmt(env.DB,'INSERT INTO feedback(id,created_at,expires_at,message,email,page,language,category,object_key,bytes,mime,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,now,expires,message,email,page,language,category,key,bytes,mime,'pending')]);}
 catch{return j({error:'Feedback limit reached. Please try another day.'},429);}
 try{if(data)await env.SHOTS.put(key,data,{httpMetadata:{contentType:mime}});await stmt(env.DB,"UPDATE feedback SET state='stored' WHERE id=?",id).run();}
 catch{await stmt(env.DB,"UPDATE feedback SET state='failed' WHERE id=?",id).run();return j({error:'Feedback could not be saved'},503);}
 if(env.NOTIFIER)ctx.waitUntil((async()=>{const ts=Math.floor(Date.now()/1000),signature=await sign(env.LINK_SECRET,'notify:'+id+':'+ts);const r=await env.NOTIFIER.fetch(new Request('https://notifier.internal/notify?id='+id,{method:'POST',headers:{'x-notify-at':String(ts),'x-notify-signature':signature}}));if(!r.ok)console.error('feedback_notify_queued',id,r.status);})().catch(()=>console.error('feedback_notify_queued',id)));
 return j({ok:true,id},201);
}
const SITE='https://germandex.com';
const LANGS=['fr','pt','es','id','tr','hr','sl','zh','hi','ta','th'];
const CITIES=['aachen','berlin','bochum','dortmund','duesseldorf','frankfurt','hamburg','koeln','muenchen','muenster','erlangen','tuebingen'];
const TOPICS=['admin','housing','medical','sports','restaurants','party','groceries'];
const SHARED=['/germany/language','/germany/etiquette','/germany/delivery','/germany/admin','/germany/housing','/germany/groceries','/germany/bank-account','/germany/health-insurance','/germany/liability-insurance','/germany/sim-card','/germany/schufa','/manifesto','/terms','/privacy','/money','/job','/job/resume','/job/reference'];
const LEGAL=new Set(['/terms','/privacy']);
const LANGNAMES={en:'English',fr:'Français',pt:'Português',es:'Español',id:'Bahasa Indonesia',tr:'Türkçe',hr:'Hrvatski',sl:'Slovenščina',zh:'中文',hi:'हिन्दी',ta:'தமிழ்',th:'ไทย'};
const secOf=r=>r.indexOf('/job')===0?'job':r.indexOf('/money')===0?'money':r.indexOf('/germany')===0?'germany':(r==='/terms'||r==='/privacy'||r==='/manifesto')?'legal':'city';
const ROUTES=new Set(SHARED);for(const c of CITIES)for(const t of TOPICS)ROUTES.add('/'+c+'/'+t);
const ALIAS={'/germany':'/germany/etiquette','/rwth':'/aachen/admin','/rwth/admin':'/aachen/admin','/rwth/sports':'/aachen/sports','/aachen':'/aachen/admin','/aachen/supermarkets':'/aachen/groceries','/aachen/delivery':'/germany/delivery','/aachen/etiquette':'/germany/etiquette','/aachen/language':'/germany/language','/university':'/aachen/admin','/university/admin':'/aachen/admin','/university/sports':'/aachen/sports','/financials':'/money','/jobs':'/job','/jobs/resume':'/job/resume','/jobs/reference':'/job/reference','/germany/supermarkets':'/aachen/groceries','/city':'/'};
for(const c of CITIES)if(!ALIAS['/'+c])ALIAS['/'+c]='/'+c+'/admin';
let SEO=null;
const I18N=new Map();
async function translations(env,url,lang){
  if(I18N.has(lang))return I18N.get(lang);
  const r=await env.ASSETS.fetch(new Request(new URL('/i18n/'+lang+'.json',url).toString()));
  if(!r.ok)throw new Error('Localized dictionary unavailable');
  const d=await r.json();I18N.set(lang,d);return d;
}
function markdownSummary(text){
  // Use existing localized editorial prose, never translate proper names automatically.
  for(const line of text.split(/\r?\n/)){
    const raw=line.trim();
    if(!raw||/^(#|>|[-*+]\s|\d+\.\s|```|\||<!--)/.test(raw))continue;
    const clean=raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'').replace(/[*_`]/g,'').replace(/\\([\\`*_{}\[\]()#+.!-])/g,'$1').replace(/\s+/g,' ').trim();
    if(clean.length<30)continue;
    return clean.length<=160?clean:clean.slice(0,157).replace(/\s+\S*$/,'')+'…';
  }
  return null;
}
async function localizedSummary(env,url,lang,route){
  const p=pathFor(lang,route).replace(/\/$/,'')+(route==='/'?'/index.md':'.md');
  const r=await env.ASSETS.fetch(new Request(new URL(p,url).toString()));
  if(!r.ok||(r.headers.get('content-type')||'').includes('text/html'))return null;
  return markdownSummary(await r.text());
}

async function seo(env,url){if(SEO)return SEO;const r=await env.ASSETS.fetch(new Request(new URL('/seo.json',url).toString()));SEO=await r.json();return SEO;}
const pathFor=(lang,r)=>{const pre=lang==='en'?'':'/'+lang;return r==='/'?(pre||'/'):pre+r;};
function meta(S,lang,route){
  const key=route==='/'?'home':(route.split('/').length===3&&CITIES.includes(route.split('/')[1])?route.split('/')[2]:route);
  const city=CITIES.includes(route.split('/')[1])?route.split('/')[1]:'';
  const cn=city?((S.CN[lang]&&S.CN[lang][city])||S.CN.en[city]):'';
  let t=(S.T[lang]&&(S.T[lang][route]||S.T[lang][key]))||S.T.en[route]||S.T.en[key]||S.T.en.home;
  let d=S.D[route]||S.D[key]||S.D.home;
  return [t.replace('{C}',cn),d.replace('{C}',cn)];
}
async function site(request,env,url){
  let p=url.pathname;
  const last=p.split('/').pop();
  if(p.endsWith('.md')||p.endsWith('/llms.txt')||p.endsWith('/llms-full.txt')){
    const res=await env.ASSETS.fetch(request);
    if(res.status!==200||(res.headers.get('content-type')||'').includes('text/html'))return new Response('Not found\n',{status:404,headers:{'content-type':'text/plain; charset=utf-8'}});
    const h=new Headers(res.headers);
    h.set('content-type','text/markdown; charset=utf-8');
    h.set('x-content-type-options','nosniff');
    h.set('link','</llms.txt>; rel="describedby"; type="text/markdown"');
    return new Response(res.body,{status:200,headers:h});
  }
  if(p==='/.well-known/mcp-registry-auth')return env.ASSETS.fetch(request);
  if(last.includes('.')||p.startsWith('/cdn-cgi/'))return env.ASSETS.fetch(request);
  if(request.method!=='GET'&&request.method!=='HEAD')return env.ASSETS.fetch(request);
  const redirect=(to,code=301)=>Response.redirect(url.origin+to+(url.search&&!to.includes('?')?url.search:''),code);
  if(p.length>1&&p.endsWith('/'))return redirect(p.replace(/\/+$/,'')||'/');
  const seg=p.split('/');
  let lang='en',route=p;
  if(seg[1]==='en')return redirect(p.slice(3)||'/');
  if(LANGS.includes(seg[1])){lang=seg[1];route=p.slice(seg[1].length+1)||'/';}
  if(route==='/'&&p==='/'+lang&&false)return null;
  if(ALIAS[route]!==undefined&&!ROUTES.has(route)&&route!=='/'){return redirect(pathFor(lang,ALIAS[route]),route==='/germany/supermarkets'||route==='/aachen/supermarkets'?302:301);}
  const cm=route.match(/^\/([a-z]+)\/courses$/);
  if(cm&&CITIES.includes(cm[1]))return Response.redirect(url.origin+pathFor(lang,'/germany/language')+'?city='+cm[1],301);
  const known=route==='/'||ROUTES.has(route);
  const S=await seo(env,url);
  const rseg=route.split('/');
  const curCity=known&&CITIES.includes(rseg[1])?rseg[1]:'';
  const curTopic=curCity?(TOPICS.includes(rseg[2])?rseg[2]:'admin'):'';
  const cnName=curCity?((S.CN[lang]&&S.CN[lang][curCity])||S.CN.en[curCity]):'';
  const sec=known?secOf(route):'';
  const res=await env.ASSETS.fetch(new Request(new URL('/',url).toString(),{headers:{'accept':'text/html'}}));
  let [title,desc]=known?meta(S,lang,route):meta(S,lang,'/');
  const localized=known&&lang!=='en'&&!LEGAL.has(route);
  // Finish pruning the shared source before localization. This keeps discarded
  // articles out of the translation pass and gives each render an owned body,
  // rather than passing a live ASSETS stream through nested rewriters.
  const pruned=new HTMLRewriter().on('article.page',{element(e){
    if(!known||e.getAttribute('data-route')!==route)e.remove();
  }}).transform(res);
  let body=new Response(await pruned.text(),{headers:res.headers});
  if(localized){
    const d=await translations(env,url,lang);
    body=new HTMLRewriter().on('[data-i18n]',{element(e){
      const k=e.getAttribute('data-i18n');
      if(Object.prototype.hasOwnProperty.call(d,k)&&typeof d[k]==='string')e.setInnerContent(d[k],{html:true});
    }}).transform(body);
    const summary=await localizedSummary(env,url,lang,route);
    desc=summary||title;
  }
  const canon=SITE+(LEGAL.has(route)?route:pathFor(lang,route));
  let alt=known?'<link rel="alternate" type="text/markdown" href="'+(LEGAL.has(route)?route:pathFor(lang,route)).replace(/\/$/,'')+(route==='/'?'/index.md':'.md')+'">':'';
  if(known&&!LEGAL.has(route)){for(const l of ['en',...LANGS])alt+='<link rel="alternate" hreflang="'+l+'" href="'+SITE+pathFor(l,route)+'">';alt+='<link rel="alternate" hreflang="x-default" href="'+SITE+pathFor('en',route)+'">';}
  const hubRoute=known?route:'/';
  const hubTopic=curTopic||'admin';
  let citiesHtml='';
  for(const c of CITIES){const n=(S.CN[lang]&&S.CN[lang][c])||S.CN.en[c];citiesHtml+='<a href="'+pathFor(lang,'/'+c+'/'+hubTopic)+'"'+(c===curCity?' class="on" aria-current="page"':'')+'>'+n+'</a>';}
  let langsHtml='';
  for(const l of ['en',...LANGS]){langsHtml+='<a href="'+pathFor(l,hubRoute)+'" hreflang="'+l+'"'+(l===lang?' class="on" aria-current="page"':'')+'>'+LANGNAMES[l]+'</a>';}
  const setc=(v)=>({element(e){e.setAttribute('content',v);}});
  let rw=new HTMLRewriter()
   .on('html',{element(e){e.setAttribute('lang',lang);}})
   .on('title',{element(e){e.setInnerContent(title);}})
   .on('meta[name="description"]',setc(desc))
   .on('meta[property="og:title"]',setc(title))
   .on('meta[property="og:description"]',setc(desc))
   .on('meta[property="og:url"]',setc(canon))
   .on('meta[name="twitter:title"]',setc(title))
   .on('meta[name="twitter:description"]',setc(desc))
   .on('link[rel="canonical"]',{element(e){e.setAttribute('href',canon);}})
   .on('head',{element(e){if(alt)e.append(alt,{html:true});}})
   .on('body',{element(e){const cls=[];if(route==='/'||!known)cls.push('is-home');if(curCity)cls.push('city-guide');if(LEGAL.has(route)||route==='/manifesto')cls.push('is-legal');if(route==='/manifesto')cls.push('is-manifesto');if(cls.length)e.setAttribute('class',cls.join(' '));}})
   .on('a[href]',{element(e){let h=e.getAttribute('href');if(!h||h.indexOf('#/')!==0)return;h=h.slice(1);const t=e.getAttribute('data-t');if(t&&TOPICS.indexOf(t)>=0){e.setAttribute('href',pathFor(lang,'/'+(curCity||'aachen')+'/'+t));return;}if(e.getAttribute('id')==='city-tab'){e.setAttribute('href',pathFor(lang,'/'+(curCity||'aachen')+'/'+(curTopic||'admin')));return;}e.setAttribute('href',pathFor(lang,h));}})
   .on('a.tab',{element(e){if(sec&&e.getAttribute('data-sec')===sec){e.setAttribute('class','tab active');e.setAttribute('aria-current','page');}}})
   .on('div.sub-tabs',{element(e){if(sec&&e.getAttribute('data-for')===sec){e.setAttribute('class','tabrow sub-tabs on');}}})
   .on('a.subtab',{element(e){const dr=e.getAttribute('data-r');const on=!!sec&&(dr?dr===route:(sec==='city'&&e.getAttribute('data-t')===curTopic));if(on){e.setAttribute('class','subtab active');e.setAttribute('aria-current','page');}}})
   .on('.cn',{element(e){if(cnName)e.setInnerContent(cnName);}})
   .on('#hero-img',{element(e){if(curCity){e.setAttribute('src','/img/'+curCity+'.jpg');if(curCity!=='aachen')e.setAttribute('alt',cnName);}}})
   .on('.cap',{element(e){e.setAttribute('class',e.getAttribute('data-city')===(curCity||'aachen')?'cap on':'cap');}})
   .on('#city-tx',{element(e){if(cnName)e.setInnerContent(cnName);}})
   .on('option',{element(e){const v=e.getAttribute('value');if(v===''){e.removeAttribute('selected');return;}if(CITIES.indexOf(v)>=0){if(v===curCity)e.setAttribute('selected','');else e.removeAttribute('selected');return;}if(v==='en'||LANGS.indexOf(v)>=0){if(v===lang)e.setAttribute('selected','');else e.removeAttribute('selected');}}})
   .on('#hub-cities',{element(e){e.setInnerContent(citiesHtml,{html:true});}})
   .on('#hub-langs',{element(e){e.setInnerContent(langsHtml,{html:true});}})
   .on('article.page',{element(e){if(!known||e.getAttribute('data-route')!==route){e.remove();return;}const classes=new Set((e.getAttribute('class')||'').split(/\s+/).filter(Boolean));classes.add('page');classes.add('show');e.setAttribute('class',[...classes].join(' '));}});
  const out=rw.transform(body);
  const h=new Headers(out.headers);
  h.set('content-type','text/html; charset=utf-8');
  const md=(LEGAL.has(route)?route:pathFor(lang,route)).replace(/\/$/,'')+(route==='/'?'/index.md':'.md');
  h.set('link','</llms.txt>; rel="describedby"; type="text/markdown"'+(known?', <'+md+'>; rel="alternate"; type="text/markdown"':''));
  h.set('cache-control','public, max-age=0, must-revalidate');
  // Complete the bounded HTML rewrite before sending headers. A stream error
  // must fail the request, never leave a 200 response with a missing article.
  return new Response(await out.text(),{status:known?200:404,headers:h});
}

export default {async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/mcp')return await handleMcp(request,env);const now=Math.floor(Date.now()/1000);if(!url.pathname.startsWith('/api/'))return await site(request,env,url);
 try{if(url.pathname==='/api/feedback'&&request.method==='POST')return await submit(request,env,url,now,ctx);if(url.pathname==='/api/screenshot'&&request.method==='GET'){if(!env.DB||!env.SHOTS||!env.LINK_SECRET)return j({error:'Not ready'},503);return await download(request,env,url,now);}return j({error:'Not found'},404);}catch{return j({error:'Feedback temporarily unavailable'},503);}}};
export {imageType,boundedBody,sign,equal};
