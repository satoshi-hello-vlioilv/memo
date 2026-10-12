const http=require('http'),fs=require('fs'),path=require('path');
/* 確認用の静的サーバー：node tools/uiux/serve.cjs [公開するフォルダ] [ポート] */
const ROOT=process.argv[2]||path.join(__dirname,'..','..'), PORT=+process.argv[3]||8934;
const T={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return;}s.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});s.end(d);});
}).listen(PORT,'127.0.0.1');
