import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const [template,styles,script]=await Promise.all(['public/index.html','public/style.css','public/app.js'].map(file=>readFile(new URL(file,root),'utf8')));
// A portable preview: no server, external stylesheet, module fetch or font download.
const css=styles.replace(/^@import[^\n]*\n/gm,'');
const previewScript=script.replace(/^const previewMode=.*$/m,'const previewMode=true;');
const html=template
 .replace('<link rel="stylesheet" href="./style.css">',`<style>${css}</style>`)
 .replace('<script defer src="./app.js"></script>',`<script>${previewScript.replace(/<\/script/gi,'<\\/script')}</script>`);
if(html===template||html.includes('src="./app.js"')||html.includes('href="./style.css"'))throw new Error('Preview template could not be bundled');
await writeFile(new URL('workcall.html',root),html);
// Preserve the previously shared offline preview filename.
await writeFile(new URL('orbit.html',root),html);
console.log('Prévia criada: workcall.html — abra diretamente no navegador.');
