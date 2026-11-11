// Generate crawler-facing Markdown from the same HTML and translations as the site.
const fs=require('node:fs'),path=require('node:path');
const cheerio=require('cheerio'),Turndown=require('turndown');
const source=fs.readFileSync('index.html','utf8'),seo=JSON.parse(fs.readFileSync('seo.json','utf8'));
const langs=['en','fr','pt','es','id','tr','hr','sl','zh','hi','ta','th'];
const legal=new Set(['/terms','/privacy']),site='https://germandex.com';
const base=cheerio.load(source),routes=['/',...base('article.page').map((i,e)=>base(e).attr('data-route')).get()];
if(routes.length!==103||new Set(routes).size!==103)throw Error('Unexpected page set');
const expected=new Map(),all={};
const urlPath=(lang,route)=>(lang==='en'?'':'/'+lang)+(route==='/'?'':route)||'/';
const mdPath=(lang,route)=>(lang==='en'?'':'/'+lang)+(route==='/'?'/index.md':route+'.md');
const cn=(lang,c)=>seo.CN[lang]?.[c]||seo.CN.en[c]||c;
for(const lang of langs){
 const translations=lang==='en'?{}:JSON.parse(fs.readFileSync('i18n/'+lang+'.json','utf8'));all[lang]=[];
 for(const route of routes){
  if(lang!=='en'&&legal.has(route))continue;
  const $=cheerio.load(route==='/'?base('#home').html():base('article.page[data-route="'+route+'"]').html());
  // Snapshot the translation nodes before replacing parents (matches the browser).
  $('[data-i18n]').toArray().forEach(e=>{const key=$(e).attr('data-i18n');if(translations[key]!=null)$(e).html(translations[key]);});
  $('.num').each((i,e)=>{const n=$(e).text();const heading=$(e).siblings('h3').first();heading.prepend(n+'. ');$(e).remove();});
  $('script,style,svg,select,button,form,.word-dl').remove();
  $('a[href="#"]').attr('href',site+'/');
  if(route==='/')$('.toggles').remove();
  // National language page exports all city variants instead of a localStorage-dependent view.
  if(route==='/germany/language'){
   $('.cn').first().parent().remove();
   $('.ccourse').each((i,e)=>$(e).prepend('<h2>'+cn(lang,$(e).attr('data-city'))+'</h2>'));
  }else $('.cn').text(cn(lang,route.split('/')[1]||'aachen'));
  const city=route.split('/')[1],key=seo.CN.en[city]?route.split('/')[2]:route;
  const title=((seo.T[lang]?.[route]||seo.T[lang]?.[key]||seo.T.en[route]||seo.T.en[key]||seo.T[lang].home)).replace('{C}',cn(lang,city));
  if(route!=='/'&&seo.CN.en[city])$('h1').first().text(cn(lang,city)+' - '+$('h1').first().text());
  $('a').each((i,e)=>{let href=$(e).attr('href');if(!href)return;if(href.startsWith('#/')){let r=href.slice(1);href=site+urlPath(legal.has(r)?'en':lang,r);}else if(href.startsWith('/'))href=site+href;$(e).attr('href',href);});
  $('img').each((i,e)=>{const src=$(e).attr('src');if(src?.startsWith('/'))$(e).attr('src',site+src);});
  const td=new Turndown({headingStyle:'atx',bulletListMarker:'-',codeBlockStyle:'fenced'});
  // Separate sibling source links so they don't become one run-on token.
  td.addRule('linkGroups',{filter:n=>n.nodeName==='P'&&n.classList.contains('links'),replacement:(content,node)=>'\n\n'+Array.from(node.children).map(n=>td.turndown(n.outerHTML)).join('\n\n')+'\n\n'});
  let text=td.turndown($.html()).replace(/\n{3,}/g,'\n\n').trim();
  if(!text.startsWith('# '))throw Error('Missing heading: '+route);
  if(route==='/')text+='\n\n## City guides\n\n'+Object.keys(seo.CN.en).map(c=>'- ['+cn(lang,c)+']('+site+mdPath(lang,'/'+c+'/admin')+')').join('\n');
  const md=text+'\n\n---\n\nSource: '+site+urlPath(lang,route)+'\n\nLanguage: '+lang+'\n';
  if(/<script|<form|data-i18n=|href="#\//i.test(md))throw Error('Markup leak');
  expected.set(mdPath(lang,route).slice(1),md);all[lang].push({route,title,md,file:mdPath(lang,route)});
 }
 expected.set((lang==='en'?'':lang+'/')+'llms-full.txt',all[lang].map(x=>x.md).join('\n\n'));
 const overview="# germandex\n\n> Student starter guides to Germany for international students, covering Aachen, Berlin, Bochum, Dortmund, Düsseldorf, Frankfurt, Hamburg, Köln, München, Münster, Erlangen and Tübingen. Maintained by editorial agents, with no ads, tracking pixels or analytics.\n\nThe guides cover arrival, university setup, housing, medical help, food, sports, nightlife, banking, jobs and everyday life in Germany. Advice and source links are provided for orientation, not as independent verification or legal, medical, tax or financial advice. Check official sources for decisions and cite the original Source URL in each Markdown export. Translations are not native-reviewed. Terms and privacy are English-only.\n\n## Start here\n\n- [Germandex homepage](https://germandex.com/): Choose a city and language.\n- [Homepage in Markdown](https://germandex.com/index.md): Text-only introduction and city entry points.\n\n## City hubs\n\n- [Aachen student guide](https://germandex.com/aachen/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Berlin student guide](https://germandex.com/berlin/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Bochum student guide](https://germandex.com/bochum/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Dortmund student guide](https://germandex.com/dortmund/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Düsseldorf student guide](https://germandex.com/duesseldorf/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Frankfurt student guide](https://germandex.com/frankfurt/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Hamburg student guide](https://germandex.com/hamburg/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Cologne student guide](https://germandex.com/koeln/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Munich student guide](https://germandex.com/muenchen/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n- [Münster student guide](https://germandex.com/muenster/admin): Arrival and university setup, with links to housing, medical help, groceries, restaurants, nightlife and sports.\n\n## Germany-wide essentials\n\n- [Money in Germany](https://germandex.com/money.md): The five things to set up in order, each with its own guide.\n- [Bank accounts](https://germandex.com/germany/bank-account.md): Student Girokonto and an optional fee-free credit card.\n- [Health insurance](https://germandex.com/germany/health-insurance.md): Statutory vs private cover for students.\n- [Liability insurance](https://germandex.com/germany/liability-insurance.md): What Haftpflicht covers and what to check before buying.\n- [SIM cards](https://germandex.com/germany/sim-card.md): Prepaid options for new arrivals.\n- [SCHUFA](https://germandex.com/germany/schufa.md): Germany's credit record explained.\n- [Student jobs](https://germandex.com/job.md): Werkstudent and part-time work.\n- [Resume example](https://germandex.com/job/resume.md): A sample resume for student job applications.\n- [Work reference example](https://germandex.com/job/reference.md): Arbeitszeugnis explained with an English sample.\n- [Admin in Germany](https://germandex.com/germany/admin.md): Address registration, health insurance, residence status and official letters.\n- [Housing in Germany](https://germandex.com/germany/housing.md): Deposits, running costs, move-in confirmation and scam checks.\n- [Supermarkets in Germany](https://germandex.com/germany/groceries.md): Discount and full-range stores, with an editorial pick.\n- [Learning German](https://germandex.com/germany/language.md): Language learning advice and courses in all twelve cities.\n- [Everyday etiquette](https://germandex.com/germany/etiquette.md): Unwritten rules for newcomers.\n- [Food and parcel delivery](https://germandex.com/germany/delivery.md): Delivery services and Packstations.\n\n";
 const listing=(lang==='en'?overview:'# germandex'+(lang==='en'?'':' ('+lang+')')+'\n\n> Student starter guides to Germany, maintained by editorial agents. Clean Markdown copies of the published site.\n\nExports preserve the site content and source links, not independent verification. For binding legal, medical, tax or money decisions, check official sources. No scripts, menus or feedback forms are included. National language guides include courses for all twelve cities. Terms and privacy are English-only. Cite the original Source URL shown in each page.\n\n')+'## Guides\n\n'+all[lang].filter(x=>!legal.has(x.route)&&x.route!='/manifesto').map(x=>'- ['+x.title+']('+site+x.file+')').join('\n')+'\n\n## Optional\n\n'+all[lang].filter(x=>legal.has(x.route)||x.route==='/manifesto').map(x=>'- ['+x.title+']('+site+x.file+')').join('\n')+'\n- [Full text ('+lang+')]('+site+(lang==='en'?'':'/'+lang)+'/llms-full.txt): All pages in this language in one file.\n'+(lang==='en'?'\n## Other languages\n\n'+langs.slice(1).map(l=>'- ['+l+']('+site+'/'+l+'/llms.txt)').join('\n')+'\n':'');
 expected.set((lang==='en'?'':lang+'/')+'llms.txt',listing);
}
if(process.argv.includes('--check')){
 for(const [file,text] of expected)if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text)throw Error('Out-of-date Markdown: '+file+'; run npm run generate:markdown');
}else for(const [file,text] of expected){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
console.log(`${[...expected.keys()].filter(x=>x.endsWith('.md')).length} Markdown pages, 12 indexes, 12 full-text exports verified.`);
