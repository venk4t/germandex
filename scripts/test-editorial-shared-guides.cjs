const fs=require('node:fs'),assert=require('node:assert/strict'),cp=require('node:child_process'),cheerio=require('cheerio');
const text=fs.readFileSync('index.html','utf8'),$=cheerio.load(text),old=cheerio.load(cp.execFileSync('git',['show','1796ada:index.html'],{encoding:'utf8'}));
const cities=['aachen','berlin','bochum','dortmund','duesseldorf','frankfurt','hamburg','koeln','muenchen','muenster','erlangen','tuebingen'];
const langs=['en','fr','pt','es','id','tr','hr','sl','zh','hi','ta','th'];
const seo=JSON.parse(fs.readFileSync('seo.json','utf8')),sitemap=fs.readFileSync('sitemap.xml','utf8');
for(const c of cities){
 if(!old(`article[data-route="/${c}/groceries"]`).length){assert.equal($(`article[data-route="/${c}/groceries"]`).length,1);continue}
 const g=$(`article[data-route="/${c}/groceries"]`),og=old(`article[data-route="/${c}/groceries"]`);
 assert.equal(g.find('[data-i18n="1169"]').length,1);assert.equal(g.find('[data-i18n="129"],[data-i18n="141"]').length,0);
 assert.equal(g.find('h2').first().nextAll().text(),og.find('h2').first().nextAll().text(),'Local store content changed: '+c);
 const h=$(`article[data-route="/${c}/housing"]`),oh=old(`article[data-route="/${c}/housing"]`);
 assert.equal(h.find('[data-i18n="1167"]').length,1);assert.equal(h.find('[data-i18n="834"],[data-i18n="835"],[data-i18n="836"]').length,0);
 assert.equal(h.find('.card').first().text(),oh.find('.card').first().text(),'Provider copy changed: '+c);
 const m=$(`article[data-route="/${c}/medical"]`),om=old(`article[data-route="/${c}/medical"]`);
 assert.equal(m.find('[data-i18n="831"]').text(),om.find('[data-i18n="831"]').text(),'Emergency copy changed: '+c);
 assert.equal(m.find('[data-i18n="832"],[data-i18n="848"]').length,0);
 assert.equal(m.find('a[href="https://www.aponet.de/notdienstsuche/-"]').length,1,'Duplicate pharmacy link: '+c);
}
for(const l of langs){
 const prefix=l==='en'?'':l+'/';
 const dict=l==='en'?null:JSON.parse(fs.readFileSync('i18n/'+l+'.json','utf8'));
 for(const section of ['housing','groceries','bank-account','health-insurance','liability-insurance','sim-card','schufa']){
  const route='/germany/'+section,a=$(`article[data-route="${route}"]`);
  assert.equal(a.length,1);
  assert(seo.T[l][route]&&seo.T[l].groceries);
  assert(sitemap.includes('https://germandex.com/'+prefix+'germany/'+section+'</loc>'));
  const md=fs.readFileSync(prefix+'germany/'+section+'.md','utf8');assert(md.startsWith('# '));
  if(dict)a.find('[data-i18n]').each((i,e)=>assert.equal(typeof dict[$(e).attr('data-i18n')],'string','Missing '+l+' translation '+$(e).attr('data-i18n')));
 }
 if(dict){
  for(const k of ['1167','1169'])assert(dict[k].includes('href="#/germany/'));
  for(const name of ['Netto','Aldi','Lidl'])assert(dict['131'].includes('>'+name+'</a>'));
  for(const name of ['Rewe','Edeka','Kaufland'])assert(dict['133'].includes('>'+name+'</a>'));
  assert(!dict['134']&&!dict['137']&&!dict['139']);
 }
}
assert.equal($('article.page').length,102);
assert(!/cheapest to priciest|cheapest of them all|Netto &lt;/i.test(text));
console.log('Editorial checks passed: all 12 cities x 12 languages, national guides, local content, emergency advice and single pharmacy lookup.');
