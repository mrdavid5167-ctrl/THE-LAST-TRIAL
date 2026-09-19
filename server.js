const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const CONFIG = path.join(ROOT, "config");
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(CONFIG, { recursive: true });

const file = n => path.join(DATA, n);
const cfg = n => path.join(CONFIG, n);
function readJSON(f, fallback) {
  try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback; }
  catch { return fallback; }
}
function writeJSON(f, value) {
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, f);
}

let players = readJSON(file("players.json"), []);
let nextPlayerId = Number(readJSON(file("nextPlayerId.json"), {nextId:1}).nextId || 1);
let nextCharacterId = Number(readJSON(file("nextCharacterId.json"), {nextId:1}).nextId || 1);

const banks = readJSON(cfg("banks.json"), []);
const factions = readJSON(cfg("factions.json"), []);
const events = readJSON(cfg("events.json"), []);
const vehicles = readJSON(cfg("vehicles.json"), []);
const characterSkins = readJSON(cfg("characters.json"), []);
const properties = readJSON(cfg("properties.json"), []);
const businesses = readJSON(cfg("businesses.json"), []);
const pets = readJSON(cfg("pets.json"), []);
const shops = readJSON(cfg("shops.json"), []);
const missions = readJSON(cfg("missions.json"), []);
const warZones = readJSON(cfg("war_zones.json"), []);
const game = readJSON(cfg("game.json"), {});
const online = new Set();
const startedAt = Date.now();

function persist() {
  writeJSON(file("players.json"), players);
  writeJSON(file("nextPlayerId.json"), {nextId: nextPlayerId});
  writeJSON(file("nextCharacterId.json"), {nextId: nextCharacterId});
}
function log(action, extra={}) {
  fs.appendFileSync(file("activity.log"), JSON.stringify({
    time:new Date().toISOString(), action, ...extra
  }) + "\n");
}
function findAccount(accountId) {
  return players.find(p => p.accountId === accountId);
}
function findCharacter(account, characterId) {
  return account && account.characters.find(c => String(c.characterId) === String(characterId));
}
function nicknameTaken(name, exceptId=null) {
  const n = String(name).trim().toLowerCase();
  return players.some(p => p.characters.some(c =>
    c.name.toLowerCase() === n && String(c.characterId) !== String(exceptId)
  ));
}
function makeCharacter(name, skinId) {
  const now = new Date().toISOString();
  return {
    characterId: nextCharacterId++,
    name,
    skinId: skinId || "skin_001",
    level: 1,
    experience: 0,
    money: 0,
    seCoins: 0,
    health: 100,
    maxHealth: 100,
    armor: 0,
    maxArmor: 100,
    hunger: 100,
    food: 100,
    faction: null,
    factionRank: 0,
    vehicles: [],
    inventory: [],
    bankAccounts: [],
    properties: [],
    businesses: [],
    pets: [],
    jobs: [],
    missions: [],
    eventHistory: [],
    position: {x:0,y:0,z:0},
    statistics: {
      playSeconds:0,
      jobsCompleted:0,
      eventsCompleted:0,
      kills:0,
      deaths:0
    },
    createdAt: now,
    updatedAt: now
  };
}
function characterView(c) {
  return {...c};
}
function accountView(a) {
  return {
    accountId:a.accountId,
    playerId:a.playerId,
    maxCharacters:5,
    activeCharacterId:a.activeCharacterId || null,
    characters:a.characters.map(characterView)
  };
}
function send(res, code, body) {
  res.writeHead(code, {
    "Content-Type":"application/json; charset=utf-8",
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Headers":"Content-Type",
    "Access-Control-Allow-Methods":"GET,POST,PUT,OPTIONS",
    "Cache-Control":"no-store"
  });
  res.end(JSON.stringify(body));
}
function fail(res, code, message, extra={}) {
  return send(res, code, {error:message, ...extra});
}
function getBody(req) {
  return new Promise((resolve,reject)=>{
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 2_000_000) req.destroy();
    });
    req.on("end", ()=>{
      if (!data.trim()) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}
function validateNickname(name, exceptId=null) {
  const n = String(name || "").trim();
  if (n.length < 2 || n.length > 24) return "Nickname must be 2-24 characters";
  if (!/^[A-Za-z0-9_ ]+$/.test(n))
    return "Nickname may contain letters, numbers, spaces and underscores only";
  if (nicknameTaken(n, exceptId)) return "Nickname already taken";
  return null;
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const u = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = u.pathname;

  if (req.method === "GET" && p === "/")
    return send(res, 200, {name:"Supreme Empire", status:"online", message:"Server is running"});

  if (req.method === "GET" && p === "/health")
    return send(res, 200, {status:"ok", uptimeSeconds:Math.floor((Date.now()-startedAt)/1000)});

  if (req.method === "GET" && p === "/api/status")
    return send(res, 200, {
      name:"Supreme Empire",
      status:"online",
      serverTime:new Date().toISOString(),
      uptimeSeconds:Math.floor((Date.now()-startedAt)/1000),
      onlinePlayers:online.size,
      totalPlayers:players.length,
      banks:banks.length,
      factions:factions.length,
      missionsOptional:true,
      events
    });

  if (req.method === "GET" && p === "/api/config")
    return send(res, 200, {
      banks, factions, events, vehicles, characters:characterSkins,
      properties, businesses, pets, shops, missions, warZones, game
    });

  if (req.method === "GET" && p === "/api/players")
    return send(res, 200, players.flatMap(a => a.characters.map(c => ({
      id:c.characterId,
      playerId:a.playerId,
      accountId:a.accountId,
      nickname:c.name,
      level:c.level,
      faction:c.faction
    }))));

  if (req.method === "POST" && p === "/api/account") {
    const a = {
      accountId:"acct_" + crypto.randomUUID(),
      playerId:nextPlayerId++,
      maxCharacters:5,
      activeCharacterId:null,
      characters:[],
      createdAt:new Date().toISOString()
    };
    players.push(a);
    persist();
    log("account_created",{playerId:a.playerId,accountId:a.accountId});
    return send(res, 201, accountView(a));
  }

  let m = p.match(/^\/api\/account\/([^/]+)$/);
  if (m && req.method === "GET") {
    const a = findAccount(decodeURIComponent(m[1]));
    return a ? send(res,200,accountView(a)) : fail(res,404,"Account not found");
  }

  m = p.match(/^\/api\/account\/([^/]+)\/login$/);
  if (m && req.method === "POST") {
    const a = findAccount(decodeURIComponent(m[1]));
    if (!a) return fail(res,404,"Account not found");
    online.add(a.accountId);
    log("login",{playerId:a.playerId});
    return send(res,200,{success:true,account:accountView(a)});
  }

  m = p.match(/^\/api\/account\/([^/]+)\/logout$/);
  if (m && req.method === "POST") {
    const a = findAccount(decodeURIComponent(m[1]));
    if (!a) return fail(res,404,"Account not found");
    online.delete(a.accountId);
    log("logout",{playerId:a.playerId});
    return send(res,200,{success:true});
  }

  m = p.match(/^\/api\/account\/([^/]+)\/characters$/);
  if (m && req.method === "GET") {
    const a = findAccount(decodeURIComponent(m[1]));
    return a ? send(res,200,accountView(a)) : fail(res,404,"Account not found");
  }
  if (m && req.method === "POST") {
    const a = findAccount(decodeURIComponent(m[1]));
    if (!a) return fail(res,404,"Account not found");
    if (a.characters.length >= 5)
      return fail(res,409,"Character limit reached",{maxCharacters:5});

    let b;
    try { b = await getBody(req); }
    catch (e) { return fail(res,400,e.message); }

    const name = String(b.name || "").trim();
    const validation = validateNickname(name);
    if (validation) return fail(res,409,validation);

    const c = makeCharacter(name, b.skinId);
    a.characters.push(c);
    if (!a.activeCharacterId) a.activeCharacterId = c.characterId;
    persist();
    log("character_created",{playerId:a.playerId,characterId:c.characterId,nickname:c.name});
    return send(res,201,{success:true,character:characterView(c),account:accountView(a)});
  }

  m = p.match(/^\/api\/account\/([^/]+)\/characters\/([^/]+)$/);
  if (m && req.method === "GET") {
    const a = findAccount(decodeURIComponent(m[1]));
    const c = findCharacter(a,decodeURIComponent(m[2]));
    if (!a) return fail(res,404,"Account not found");
    return c
      ? send(res,200,{accountId:a.accountId,playerId:a.playerId,character:characterView(c)})
      : fail(res,404,"Character not found");
  }

  m = p.match(/^\/api\/account\/([^/]+)\/characters\/([^/]+)\/data$/);
  if (m && req.method === "GET") {
    const a = findAccount(decodeURIComponent(m[1]));
    const c = findCharacter(a,decodeURIComponent(m[2]));
    if (!a) return fail(res,404,"Account not found");
    return c
      ? send(res,200,{accountId:a.accountId,playerId:a.playerId,character:characterView(c)})
      : fail(res,404,"Character not found");
  }

  m = p.match(/^\/api\/account\/([^/]+)\/characters\/([^/]+)\/select$/);
  if (m && req.method === "POST") {
    const a = findAccount(decodeURIComponent(m[1]));
    const c = findCharacter(a,decodeURIComponent(m[2]));
    if (!a) return fail(res,404,"Account not found");
    if (!c) return fail(res,404,"Character not found");
    a.activeCharacterId = c.characterId;
    persist();
    log("character_selected",{playerId:a.playerId,characterId:c.characterId});
    return send(res,200,{success:true,activeCharacterId:c.characterId,character:characterView(c)});
  }

  m = p.match(/^\/api\/account\/([^/]+)\/characters\/([^/]+)\/save$/);
  if (m && (req.method === "POST" || req.method === "PUT")) {
    const a = findAccount(decodeURIComponent(m[1]));
    const c = findCharacter(a,decodeURIComponent(m[2]));
    if (!a) return fail(res,404,"Account not found");
    if (!c) return fail(res,404,"Character not found");

    let b;
    try { b = await getBody(req); }
    catch (e) { return fail(res,400,e.message); }

    if (b.name !== undefined) {
      const validation = validateNickname(String(b.name),c.characterId);
      if (validation) return fail(res,409,validation);
    }

    const fields = [
      "name","skinId","level","experience","money","seCoins",
      "health","maxHealth","armor","maxArmor","hunger","food",
      "faction","factionRank","vehicles","inventory","bankAccounts",
      "properties","businesses","pets","jobs","missions","eventHistory",
      "position","statistics"
    ];
    for (const k of fields) {
      if (Object.prototype.hasOwnProperty.call(b,k)) c[k] = b[k];
    }
    c.updatedAt = new Date().toISOString();
    persist();
    log("character_saved",{playerId:a.playerId,characterId:c.characterId});
    return send(res,200,{success:true,savedAt:c.updatedAt,character:characterView(c)});
  }

  m = p.match(/^\/api\/account\/([^/]+)\/characters\/([^/]+)\/position$/);
  if (m && req.method === "POST") {
    const a = findAccount(decodeURIComponent(m[1]));
    const c = findCharacter(a,decodeURIComponent(m[2]));
    if (!a || !c) return fail(res,404,"Character not found");
    let b;
    try { b = await getBody(req); } catch(e) { return fail(res,400,e.message); }
    const x=Number(b.x), y=Number(b.y), z=Number(b.z);
    if (![x,y,z].every(Number.isFinite)) return fail(res,400,"Invalid position");
    c.position={x,y,z};
    c.updatedAt=new Date().toISOString();
    persist();
    return send(res,200,{success:true,position:c.position,savedAt:c.updatedAt});
  }

  return fail(res,404,"Not Found");
}

http.createServer((req,res)=>{
  route(req,res).catch(e=>{
    console.error(e);
    if (!res.headersSent) fail(res,500,"Internal Server Error");
  });
}).listen(PORT,"0.0.0.0",()=>{
  console.log(`Supreme Empire server listening on 0.0.0.0:${PORT}`);
  console.log(`Players: ${players.length} | Banks: ${banks.length} | Factions: ${factions.length}`);
});
