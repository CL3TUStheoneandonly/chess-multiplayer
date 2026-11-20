// Local Wi-Fi lobby server for the Chess game. Requires Node.js 18+.
// Run: node chess_lan_server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const PORT = process.env.PORT || 8787;
const GAME_FILE = path.join(__dirname, 'chess_full_coach_wifi.html');
const games = new Map();
const json = (res, code, data) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify(data)); };
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>100000)reject(new Error('Request too large'))});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});});}
function clean(){const now=Date.now();for(const [code,g] of games){if(now-g.hostSeen>30000)games.delete(code);else if(g.guest&&now-g.guestSeen>20000){g.guest=null;g.guestSeen=0;}}}
function newCode(){let c;do{c=String(Math.floor(10000+Math.random()*90000))}while(games.has(c));return c;}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type'});return res.end()}
  if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html')){try{const b=fs.readFileSync(GAME_FILE);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(b)}catch(e){res.writeHead(500);return res.end('Game HTML not found. Keep chess_full_coach_wifi.html beside this server file.')}}
  try{
    clean();
    if(req.method==='GET'&&u.pathname==='/api/games')return json(res,200,{games:[...games].filter(([c,g])=>!g.guest&&Date.now()-g.hostSeen<15000).map(([code,g])=>({code,name:g.name}))});
    if(req.method==='GET'&&u.pathname==='/api/poll'){
      const code=u.searchParams.get('code'),id=u.searchParams.get('clientId'),g=games.get(code);if(!g)return json(res,404,{error:'That game is no longer available'});
      let queue;if(id===g.hostId){g.hostSeen=Date.now();queue=g.toHost;g.toHost=[];}else if(id===g.guest){g.guestSeen=Date.now();queue=g.toGuest;g.toGuest=[];}else return json(res,403,{error:'You are not part of this game'});
      return json(res,200,{connected:!!g.guest&&Date.now()-g.guestSeen<20000,messages:queue,closed:false});
    }
    if(req.method==='POST'){
      const b=await body(req);
      if(u.pathname==='/api/create'){const code=newCode(),clientId=require('crypto').randomUUID();games.set(code,{hostId:clientId,guest:null,hostSeen:Date.now(),guestSeen:0,name:String(b.name||'Player').slice(0,24),toHost:[],toGuest:[]});return json(res,200,{code,clientId})}
      if(u.pathname==='/api/join'){const g=games.get(String(b.code));if(!g)return json(res,404,{error:'Game not found'});if(g.guest)return json(res,409,{error:'That game already has a player'});const clientId=require('crypto').randomUUID();g.guest=clientId;g.guestSeen=Date.now();return json(res,200,{clientId})}
      if(u.pathname==='/api/message'){const g=games.get(String(b.code));if(!g)return json(res,404,{error:'Game ended'});const item={type:String(b.type),data:b.data};if(b.clientId===g.hostId)g.toGuest.push(item);else if(b.clientId===g.guest){g.toHost.push(item);g.guestSeen=Date.now()}else return json(res,403,{error:'Not a player in this game'});return json(res,200,{ok:true})}
      if(u.pathname==='/api/leave'){const g=games.get(String(b.code));if(g){if(b.clientId===g.hostId)games.delete(String(b.code));else if(b.clientId===g.guest){g.guest=null;g.guestSeen=0;g.toHost.push({type:'left',data:{}})}}return json(res,200,{ok:true})}
    }
    return json(res,404,{error:'Not found'});
  }catch(e){return json(res,400,{error:e.message||'Bad request'})}
});
server.listen(PORT,'0.0.0.0',()=>{
  console.log('\nChess Wi-Fi lobby is running. On devices connected to this Wi-Fi, open:');
  const nets=os.networkInterfaces();for(const list of Object.values(nets))for(const n of list||[])if(n.family==='IPv4'&&!n.internal)console.log(`  http://${n.address}:${PORT}`);
  console.log('\nKeep this window open while playing. Press Ctrl+C to stop.\n');
});
