import { useState, useEffect, useCallback, useRef } from "react";
import { api, openStream } from "./api.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const TEMPLATES = [
  { id:"it-reset",  name:"IT Password Reset", lure:"urgency",
    subject:"⚠️ Urgent: Your password expires in 24 hours",
    body:"Dear {name},\n\nOur security team has flagged your account for a mandatory password reset.\nClick below to avoid losing access:\n\n[RESET MY PASSWORD NOW]\n\nThis link expires in 24 hours.\n\n— IT Security Team" },
  { id:"hr-payroll", name:"HR Payroll Update", lure:"financial",
    subject:"Action Required: Update your direct deposit details",
    body:"Hi {name},\n\nOur payroll system is migrating. Please verify your banking details by EOD to avoid payment delays.\n\n[UPDATE BANKING INFO]\n\nHR Department" },
  { id:"ceo-wire",  name:"CEO Wire Transfer", lure:"authority",
    subject:"Confidential: Urgent wire needed today",
    body:"{name},\n\nI need you to process an urgent wire transfer for a confidential acquisition. Time-sensitive.\n\n[VIEW TRANSFER DETAILS]\n\nDo not discuss with others.\n— CEO" },
  { id:"shared-doc", name:"Shared Document", lure:"curiosity",
    subject:"{sender} shared a document with you",
    body:"Hi {name},\n\n{sender} has shared a confidential document: \"Q4 Financials - INTERNAL ONLY\"\n\n[OPEN DOCUMENT]\n\n— Google Workspace" },
];

const SAMPLE_TARGETS = [
  { name:"Alice Morgan", email:"alice@testorg.local", dept:"Engineering" },
  { name:"Bob Chen",     email:"bob@testorg.local",   dept:"Finance"     },
  { name:"Carol Davis",  email:"carol@testorg.local",  dept:"HR"          },
  { name:"David Kim",    email:"david@testorg.local",  dept:"Marketing"   },
  { name:"Eva Rossi",    email:"eva@testorg.local",    dept:"Operations"  },
  { name:"Frank Osei",   email:"frank@testorg.local",  dept:"Finance"     },
  { name:"Grace Liu",    email:"grace@testorg.local",  dept:"Engineering" },
  { name:"Hank Patel",   email:"hank@testorg.local",   dept:"Legal"       },
  { name:"Iris Nkosi",   email:"iris@testorg.local",   dept:"Marketing"   },
  { name:"James Wu",     email:"james@testorg.local",  dept:"Operations"  },
];

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oxanium:wght@300;400;500;600;700;800&family=Inconsolata:wght@300;400;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#07080d;--s1:#0c0e17;--s2:#111320;--s3:#171a2e;
  --border:#1c1f35;--border2:#252840;
  --red:#ff2d55;--red-dim:rgba(255,45,85,.12);--red-glow:rgba(255,45,85,.25);
  --amber:#ff9500;--amber-dim:rgba(255,149,0,.1);
  --cyan:#00d4ff;--cyan-dim:rgba(0,212,255,.08);--cyan-glow:rgba(0,212,255,.2);
  --green:#30d158;--green-dim:rgba(48,209,88,.1);
  --gem:#4285f4;--gem-dim:rgba(66,133,244,.12);
  --text:#e8eaf2;--text2:#9499b5;--text3:#565a78;
  --disp:'Oxanium',sans-serif;--mono:'Inconsolata',monospace;
  --sidebar-w:240px;--topbar-h:56px;--bottomnav-h:60px;
}
html,body{height:100%;overflow:hidden;}
body{background:var(--bg);color:var(--text);font-family:var(--disp);font-size:14px;}
body::before{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");pointer-events:none;z-index:9999;opacity:.4;}
.app{display:grid;grid-template-areas:"top top" "side main";grid-template-columns:var(--sidebar-w) 1fr;grid-template-rows:var(--topbar-h) 1fr;height:100vh;overflow:hidden;}
.topbar{grid-area:top;background:var(--s1);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 1.25rem;gap:1rem;z-index:50;position:relative;}
.topbar::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,var(--red),var(--cyan),transparent);opacity:.5;}
.logo{font-family:var(--disp);font-weight:800;font-size:1.25rem;letter-spacing:.12em;color:var(--text);display:flex;align-items:center;gap:.5rem;flex-shrink:0;}
.logo em{color:var(--red);font-style:normal;}
.logo-badge{background:var(--red);color:white;font-size:.48rem;font-weight:700;font-family:var(--mono);padding:2px 6px;border-radius:2px;letter-spacing:.12em;text-transform:uppercase;}
.campaign-chip{background:var(--s3);border:1px solid var(--border2);border-radius:4px;padding:.3rem .75rem;font-family:var(--mono);font-size:.65rem;color:var(--text2);letter-spacing:.06em;display:flex;align-items:center;gap:.5rem;}
.live-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);animation:blink 2s ease-in-out infinite;flex-shrink:0;}
@keyframes blink{0%,100%{opacity:1;}50%{opacity:.3;}}
.sse-badge{display:flex;align-items:center;gap:.35rem;font-family:var(--mono);font-size:.6rem;padding:.25rem .6rem;border-radius:3px;border:1px solid;}
.sse-badge.connected{background:var(--green-dim);border-color:rgba(48,209,88,.3);color:var(--green);}
.sse-badge.connecting{background:var(--amber-dim);border-color:rgba(255,149,0,.3);color:var(--amber);}
.sse-badge.error{background:var(--red-dim);border-color:rgba(255,45,85,.3);color:var(--red);}
.topbar-right{display:flex;align-items:center;gap:.75rem;margin-left:auto;}
.topbar-stat{font-family:var(--mono);font-size:.62rem;color:var(--text3);display:flex;align-items:center;gap:.3rem;}
.topbar-stat strong{color:var(--red);font-size:.82rem;}
.menu-toggle{display:none;background:none;border:1px solid var(--border2);color:var(--text2);width:32px;height:32px;border-radius:4px;cursor:pointer;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;}
.sidebar{grid-area:side;background:var(--s1);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;z-index:40;transition:transform .25s cubic-bezier(.4,0,.2,1);}
.sidebar-top{padding:1.25rem 1rem .75rem;border-bottom:1px solid var(--border);}
.sidebar-camp-label{font-family:var(--mono);font-size:.52rem;color:var(--text3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:.4rem;}
.sidebar-camp-name{font-weight:700;font-size:.85rem;color:var(--text);letter-spacing:.04em;}
.sidebar-camp-meta{font-family:var(--mono);font-size:.62rem;color:var(--text3);margin-top:.2rem;}
.nav-section{font-family:var(--mono);font-size:.5rem;color:var(--text3);letter-spacing:.18em;text-transform:uppercase;padding:.9rem 1rem .3rem;}
.nav-item{display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;cursor:pointer;border-left:2px solid transparent;transition:all .15s;color:var(--text3);font-size:.82rem;font-weight:500;letter-spacing:.03em;position:relative;}
.nav-item:hover{color:var(--text2);background:rgba(255,255,255,.02);}
.nav-item.active{color:var(--text);background:var(--red-dim);border-left-color:var(--red);}
.nav-icon{font-size:.9rem;width:18px;text-align:center;flex-shrink:0;}
.nav-badge{margin-left:auto;background:var(--red);color:white;font-family:var(--mono);font-size:.52rem;padding:1px 5px;border-radius:2px;font-weight:700;}
.sidebar-mini-stats{margin-top:auto;padding:1rem;border-top:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:.5rem;}
.mini-stat{background:var(--s2);border:1px solid var(--border);border-radius:4px;padding:.5rem .6rem;}
.mini-stat-lbl{font-family:var(--mono);font-size:.5rem;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;}
.mini-stat-val{font-weight:700;font-size:1.1rem;margin-top:.1rem;}
.mini-stat-val.red{color:var(--red);}
.mini-stat-val.cyan{color:var(--cyan);}
.main{grid-area:main;overflow-y:auto;overflow-x:hidden;background:var(--bg);padding:1.5rem;scrollbar-width:thin;scrollbar-color:var(--border2) transparent;}
.main::-webkit-scrollbar{width:4px;}
.main::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}
.page-header{margin-bottom:1.5rem;}
.page-title{font-family:var(--disp);font-weight:800;font-size:clamp(1.4rem,3vw,2rem);letter-spacing:.08em;line-height:1;background:linear-gradient(135deg,var(--text) 0%,var(--text2) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.page-sub{font-family:var(--mono);font-size:.65rem;color:var(--text3);letter-spacing:.1em;text-transform:uppercase;margin-top:.25rem;}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.25rem;}
.stat-card{background:var(--s1);border:1px solid var(--border);border-radius:6px;padding:1rem 1.1rem;position:relative;overflow:hidden;transition:border-color .2s,transform .15s;}
.stat-card::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at top left,var(--glow-color,transparent) 0%,transparent 70%);opacity:.4;pointer-events:none;}
.stat-card.r{--glow-color:var(--red-glow);border-color:rgba(255,45,85,.2);}
.stat-card.a{--glow-color:rgba(255,149,0,.15);border-color:rgba(255,149,0,.2);}
.stat-card.g{--glow-color:rgba(48,209,88,.1);border-color:rgba(48,209,88,.2);}
.stat-card.c{--glow-color:var(--cyan-glow);border-color:rgba(0,212,255,.2);}
.stat-lbl{font-family:var(--mono);font-size:.55rem;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;margin-bottom:.35rem;}
.stat-val{font-weight:800;font-size:clamp(1.6rem,3vw,2.2rem);line-height:1;transition:all .3s;}
.stat-card.r .stat-val{color:var(--red);}
.stat-card.a .stat-val{color:var(--amber);}
.stat-card.g .stat-val{color:var(--green);}
.stat-card.c .stat-val{color:var(--cyan);}
.stat-note{font-family:var(--mono);font-size:.6rem;color:var(--text3);margin-top:.25rem;}
.stat-bar{height:3px;background:var(--border2);border-radius:100px;overflow:hidden;margin-top:.6rem;}
.stat-fill{height:100%;border-radius:100px;transition:width .6s cubic-bezier(.4,0,.2,1);}
.stat-card.r .stat-fill{background:linear-gradient(90deg,var(--red),var(--amber));}
.stat-card.a .stat-fill{background:linear-gradient(90deg,var(--amber),var(--red));}
.cg2{display:grid;grid-template-columns:1.3fr 1fr;gap:1rem;}
.cg2e{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
.col{display:flex;flex-direction:column;gap:1rem;}
.panel{background:var(--s1);border:1px solid var(--border);border-radius:6px;overflow:hidden;}
.panel-header{padding:.75rem 1rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--s2);}
.panel-title{font-family:var(--mono);font-size:.6rem;color:var(--text3);letter-spacing:.14em;text-transform:uppercase;display:flex;align-items:center;gap:.4rem;}
.panel-title .accent{color:var(--cyan);}
.panel-body{padding:1rem;}
.table-wrap{overflow-x:auto;}
table{width:100%;border-collapse:collapse;font-size:.75rem;min-width:420px;}
th{background:var(--s2);font-family:var(--mono);font-size:.55rem;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;padding:.6rem .85rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap;}
td{padding:.6rem .85rem;border-bottom:1px solid var(--border);color:var(--text2);white-space:nowrap;transition:background .15s;}
tr:last-child td{border-bottom:none;}
tr:hover td{background:rgba(255,255,255,.015);}
td strong{color:var(--text);}
.pill{display:inline-flex;align-items:center;gap:.2rem;padding:2px 7px;border-radius:3px;font-family:var(--mono);font-size:.54rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;}
.pill.r{background:var(--red-dim);color:var(--red);border:1px solid rgba(255,45,85,.25);}
.pill.g{background:var(--green-dim);color:var(--green);border:1px solid rgba(48,209,88,.25);}
.pill.m{background:rgba(86,90,120,.12);color:var(--text3);border:1px solid var(--border2);}
.pill.a{background:var(--amber-dim);color:var(--amber);border:1px solid rgba(255,149,0,.25);}
.pill.c{background:var(--cyan-dim);color:var(--cyan);border:1px solid rgba(0,212,255,.2);}
.dept-row{margin-bottom:.65rem;}
.dept-row:last-child{margin-bottom:0;}
.dept-meta{display:flex;justify-content:space-between;font-family:var(--mono);font-size:.65rem;margin-bottom:.2rem;}
.dept-pbar{height:3px;background:var(--border2);border-radius:100px;overflow:hidden;}
.dept-fill{height:100%;border-radius:100px;background:linear-gradient(90deg,var(--red),var(--amber));transition:width .6s ease;}
.logfeed{font-family:var(--mono);font-size:.65rem;line-height:1.9;max-height:190px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border2) transparent;}
.log-entry{display:flex;gap:.5rem;align-items:baseline;}
.log-time{color:var(--text3);flex-shrink:0;font-size:.6rem;}
.log-msg{flex:1;}
.log-msg.click{color:var(--red);}
.log-msg.submit{color:var(--amber);}
.log-msg.sent{color:var(--cyan);}
.alert{padding:.55rem .85rem;border-radius:4px;font-family:var(--mono);font-size:.65rem;letter-spacing:.03em;border:1px solid;margin-bottom:.85rem;}
.alert.w{background:var(--amber-dim);border-color:rgba(255,149,0,.3);color:var(--amber);}
.alert.i{background:var(--cyan-dim);border-color:rgba(0,212,255,.2);color:var(--cyan);}
.alert.r{background:var(--red-dim);border-color:rgba(255,45,85,.3);color:var(--red);}
.alert.g{background:var(--green-dim);border-color:rgba(48,209,88,.25);color:var(--green);}
.btn{display:inline-flex;align-items:center;gap:.35rem;background:var(--red);color:white;border:none;font-family:var(--mono);font-size:.65rem;font-weight:700;padding:.5rem 1rem;border-radius:3px;cursor:pointer;letter-spacing:.08em;text-transform:uppercase;transition:all .15s;flex-shrink:0;}
.btn:hover{filter:brightness(1.15);transform:translateY(-1px);}
.btn:active{transform:translateY(0);}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;filter:none;}
.btn.sec{background:var(--s2);color:var(--text2);border:1px solid var(--border2);}
.btn.sec:hover{border-color:var(--cyan);color:var(--cyan);}
.btn.gem{background:var(--gem);color:white;}
.btn.gem:hover{filter:brightness(1.12);}
.btn-row{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem;align-items:center;}
.fr{margin-bottom:.75rem;}
.fr label{display:block;font-family:var(--mono);font-size:.57rem;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;margin-bottom:.3rem;}
.fr input,.fr select{width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);font-family:var(--mono);font-size:.78rem;padding:.5rem .75rem;border-radius:3px;outline:none;transition:border-color .15s;}
.fr input:focus,.fr select:focus{border-color:var(--cyan);box-shadow:0 0 0 2px var(--cyan-dim);}
.tcard{background:var(--s2);border:1px solid var(--border2);border-radius:4px;padding:.75rem .85rem;cursor:pointer;transition:all .15s;margin-bottom:.5rem;}
.tcard:last-child{margin-bottom:0;}
.tcard:hover{border-color:var(--cyan);}
.tcard.sel{border-color:var(--red);background:var(--red-dim);}
.tcard-name{font-size:.8rem;font-weight:600;color:var(--text);margin-bottom:.15rem;}
.tcard-subj{font-family:var(--mono);font-size:.62rem;color:var(--text3);margin-bottom:.3rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tcard-lure{font-family:var(--mono);font-size:.52rem;color:var(--amber);letter-spacing:.1em;text-transform:uppercase;}
.email-chrome{background:var(--s3);border-bottom:1px solid var(--border);padding:.65rem .9rem;}
.email-from{font-family:var(--mono);font-size:.58rem;color:var(--text3);}
.email-subj{font-size:.8rem;font-weight:600;color:var(--text);margin-top:.15rem;}
.email-body{padding:.9rem;font-family:var(--mono);font-size:.7rem;line-height:1.85;color:var(--text2);white-space:pre-line;}
.phlink{display:inline-block;padding:.35rem .9rem;background:var(--red);color:white;border-radius:3px;font-size:.68rem;font-weight:700;cursor:pointer;transition:filter .15s;margin:.3rem 0;letter-spacing:.04em;}
.phlink:hover{filter:brightness(1.2);}
.inbox-row{display:flex;align-items:center;gap:.75rem;padding:.65rem .9rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s;}
.inbox-row:last-child{border-bottom:none;}
.inbox-row:hover{background:rgba(255,255,255,.02);}
.inbox-row.active{background:var(--red-dim);border-left:2px solid var(--red);}
.avatar{width:30px;height:30px;border-radius:50%;background:var(--s3);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.7rem;color:var(--text2);flex-shrink:0;}
.inbox-info{flex:1;min-width:0;}
.inbox-name{font-size:.78rem;font-weight:600;color:var(--text);}
.inbox-preview{font-family:var(--mono);font-size:.6rem;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.harvest-bg{background:#0f111a;border-radius:4px;padding:2rem 1rem;display:flex;align-items:center;justify-content:center;min-height:280px;}
.harvest-card{background:#1a1c2e;border:1px solid var(--border2);border-radius:8px;padding:1.5rem;width:100%;max-width:300px;}
.harvest-logo{text-align:center;font-weight:700;font-size:.9rem;margin-bottom:.75rem;color:var(--text);letter-spacing:.06em;}
.harvest-logo span{color:var(--red);}
.hf label{display:block;font-family:var(--mono);font-size:.6rem;color:var(--text3);margin-bottom:4px;margin-top:12px;letter-spacing:.08em;}
.hf input{width:100%;background:var(--bg);border:1px solid var(--border2);color:var(--text);font-family:var(--mono);font-size:.75rem;padding:8px 10px;border-radius:3px;outline:none;}
.hf input:focus{border-color:var(--red);}
.hf button{width:100%;margin-top:12px;padding:9px;background:var(--red);color:white;border:none;border-radius:3px;font-family:var(--mono);font-size:.75rem;font-weight:700;cursor:pointer;letter-spacing:.06em;text-transform:uppercase;}
.caught-screen{text-align:center;padding:2rem 1rem;display:flex;flex-direction:column;align-items:center;gap:.75rem;}
.caught-title{font-weight:800;font-size:1.3rem;color:var(--red);letter-spacing:.06em;}
.caught-body{font-family:var(--mono);font-size:.68rem;color:var(--text3);line-height:1.9;max-width:380px;}
.report-body{font-family:var(--mono);font-size:.7rem;line-height:1.85;color:var(--text2);white-space:pre-wrap;max-height:400px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border2) transparent;}
.report-body h2{font-family:var(--disp);font-size:1rem;color:var(--text);letter-spacing:.06em;margin:1rem 0 .4rem;}
.report-body h3{font-family:var(--mono);font-size:.62rem;color:var(--cyan);letter-spacing:.12em;text-transform:uppercase;margin:.75rem 0 .2rem;}
.report-body strong{color:var(--text);}
.divider{border:none;border-top:1px solid var(--border);margin:1rem 0;}
.splash{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:1rem;text-align:center;padding:2rem;}
.splash h2{font-weight:800;font-size:1.5rem;letter-spacing:.06em;}
.splash p{font-family:var(--mono);font-size:.68rem;color:var(--text3);max-width:340px;line-height:1.8;}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:35;backdrop-filter:blur(2px);}
.bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;height:var(--bottomnav-h);background:var(--s1);border-top:1px solid var(--border);z-index:30;align-items:stretch;}
.bn-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;color:var(--text3);font-family:var(--mono);font-size:.5rem;letter-spacing:.06em;text-transform:uppercase;transition:color .15s;border-top:2px solid transparent;padding-top:4px;}
.bn-item:hover{color:var(--text2);}
.bn-item.active{color:var(--red);border-top-color:var(--red);}
.bn-icon{font-size:1.1rem;}
.spin{animation:rotate 1s linear infinite;display:inline-block;}
@keyframes rotate{to{transform:rotate(360deg);}}
@keyframes flashIn{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:translateY(0);}}
.flash-in{animation:flashIn .3s ease;}
@keyframes pulseRow{0%{background:rgba(255,45,85,.18);}100%{background:transparent;}}
.row-flash{animation:pulseRow 1.5s ease;}
@media(max-width:1024px){
  :root{--sidebar-w:56px;}
  .sidebar-top,.nav-section,.sidebar-mini-stats{display:none;}
  .nav-item{justify-content:center;padding:.65rem 0;}
  .nav-item span:not(.nav-icon){display:none;}
  .nav-badge{display:none;}
  .stats-grid{grid-template-columns:repeat(2,1fr);}
  .cg2{grid-template-columns:1fr;}
  .campaign-chip{display:none;}
}
@media(max-width:640px){
  :root{--topbar-h:50px;}
  .app{grid-template-areas:"top" "main";grid-template-columns:1fr;grid-template-rows:var(--topbar-h) 1fr;}
  .sidebar{position:fixed;top:0;left:0;bottom:0;width:260px;transform:translateX(-100%);z-index:45;}
  .sidebar.open{transform:translateX(0);}
  .sidebar-top,.nav-section,.sidebar-mini-stats{display:flex;}
  .sidebar-top{flex-direction:column;}
  .nav-item{justify-content:flex-start;padding:.6rem 1rem;}
  .nav-item span:not(.nav-icon){display:inline;}
  .nav-badge{display:inline-block;}
  .overlay.open{display:block;}
  .bottom-nav{display:flex;}
  .menu-toggle{display:flex;}
  .main{padding:1rem;padding-bottom:calc(var(--bottomnav-h) + 1rem);}
  .stats-grid{grid-template-columns:repeat(2,1fr);gap:.5rem;}
  .cg2,.cg2e{grid-template-columns:1fr;}
  .topbar-right{display:none;}
  .logo-badge{display:none;}
}
@media(max-width:380px){.stat-val{font-size:1.4rem!important;}}
`;

// ─── useSSE hook ──────────────────────────────────────────────────────────────
function useSSE(campaignId) {
  const [connected, setConnected] = useState(false);
  const [targets, setTargets] = useState([]);
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [flashEvent, setFlashEvent] = useState(null);
  const flashTimer = useRef(null);

  const flash = (ev) => {
    setFlashEvent(ev);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashEvent(null), 3000);
  };

  useEffect(() => {
    if (!campaignId) return;
    setConnected(false);

    const close = openStream(campaignId, {
      onConnected: ({ stats, targets, events }) => {
        setStats(stats);
        setTargets(targets);
        setEvents(events);
        setConnected(true);
      },
      onClick: ({ target, stats, timestamp }) => {
        setStats(stats);
        setTargets(ts => ts.map(t => t.id === target.id ? { ...t, ...target } : t));
        const ev = { id: Date.now(), event_type: "click", target_name: target.name, department: target.department, timestamp };
        setEvents(es => [ev, ...es].slice(0, 100));
        flash(ev);
      },
      onSubmit: ({ target, stats, timestamp }) => {
        setStats(stats);
        setTargets(ts => ts.map(t => t.id === target.id ? { ...t, ...target } : t));
        const ev = { id: Date.now(), event_type: "submit", target_name: target.name, department: target.department, timestamp };
        setEvents(es => [ev, ...es].slice(0, 100));
        flash(ev);
      },
      onSent: ({ target, stats }) => {
        setStats(stats);
        setTargets(ts => ts.map(t => t.id === target.id ? { ...t, email_sent: 1 } : t));
      },
      onError: () => setConnected(false),
    });

    return () => { close(); clearTimeout(flashTimer.current); };
  }, [campaignId]);

  return { connected, targets, events, stats, flashEvent };
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaignId, setActiveCampaignId] = useState(null);
  const [backendLoading, setBackendLoading] = useState(true);

  const { connected, targets, events, stats, flashEvent } = useSSE(activeCampaignId);

  useEffect(() => {
    api.getCampaigns().then(data => {
      setCampaigns(data);
      if (data.length) setActiveCampaignId(data[0].id);
    }).catch(() => {}).finally(() => setBackendLoading(false));
  }, []);

  const reloadCampaigns = useCallback(async () => {
    const data = await api.getCampaigns();
    setCampaigns(data);
  }, []);

  const navTo = (p) => { setPage(p); setSidebarOpen(false); };

  const clicked   = targets.filter(t => t.clicked).length;
  const safe      = targets.filter(t => !t.clicked).length;
  const clickRate = stats?.clickRate ?? "0";

  const NAV = [
    { id:"dashboard", icon:"📊", label:"Dashboard", badge: clicked > 0 ? clicked : null },
    { id:"campaigns",  icon:"🚀", label:"Campaigns" },
    { id:"simulate",   icon:"🎯", label:"Simulate" },
    { id:"report",     icon:"📋", label:"Report" },
  ];

  const activeCampaign = campaigns.find(c => c.id === activeCampaignId);

  return (
    <>
      <style>{CSS}</style>
      <div className={`overlay${sidebarOpen ? " open" : ""}`} onClick={() => setSidebarOpen(false)} />

      <div className="app">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setSidebarOpen(o => !o)}>☰</button>
          <div className="logo">⚠ PHISH<em>SIM</em> <span className="logo-badge">TRAINING</span></div>
          {activeCampaign && (
            <div className="campaign-chip">
              <div className="live-dot" />
              {activeCampaign.name} · ACTIVE
            </div>
          )}
          <div className="topbar-right">
            <div className={`sse-badge ${connected ? "connected" : backendLoading ? "connecting" : "error"}`}>
              <span>{connected ? "●" : backendLoading ? "◌" : "✕"}</span>
              {connected ? "SSE LIVE" : backendLoading ? "CONNECTING" : "DISCONNECTED"}
            </div>
            <div className="topbar-stat"><strong>{clickRate}%</strong> click rate</div>
            <div className="topbar-stat" style={{ color:"var(--text3)" }}>|</div>
            <div className="topbar-stat"><strong style={{ color:"var(--cyan)" }}>{targets.length}</strong> targets</div>
          </div>
        </header>

        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-top">
            <div className="sidebar-camp-label">Active Campaign</div>
            <div className="sidebar-camp-name">{activeCampaign?.name || "—"}</div>
            <div className="sidebar-camp-meta">{clickRate}% click rate · {targets.length} targets</div>
          </div>
          <div className="nav-section">Navigation</div>
          {NAV.map(n => (
            <div key={n.id} className={`nav-item${page === n.id ? " active" : ""}`} onClick={() => navTo(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
              {n.badge && <span className="nav-badge">{n.badge}</span>}
            </div>
          ))}
          <div className="sidebar-mini-stats">
            <div className="mini-stat">
              <div className="mini-stat-lbl">Click %</div>
              <div className="mini-stat-val red">{clickRate}%</div>
            </div>
            <div className="mini-stat">
              <div className="mini-stat-lbl">Safe</div>
              <div className="mini-stat-val cyan">{safe}</div>
            </div>
          </div>
        </aside>

        <main className="main">
          {backendLoading ? (
            <div className="splash">
              <span className="spin" style={{ fontSize:"2rem" }}>⚙</span>
              <p>Connecting to backend...</p>
            </div>
          ) : (
            <>
              {flashEvent && (
                <div className={`alert ${flashEvent.event_type === "submit" ? "w" : "r"} flash-in`}>
                  {flashEvent.event_type === "click"
                    ? `🎣 LIVE: ${flashEvent.target_name} (${flashEvent.department}) just clicked the phishing link`
                    : `🔑 LIVE: ${flashEvent.target_name} (${flashEvent.department}) just submitted credentials`}
                </div>
              )}
              {page === "dashboard" && <Dashboard campaigns={campaigns} activeCampaignId={activeCampaignId} setActiveCampaignId={setActiveCampaignId} targets={targets} events={events} stats={stats} connected={connected} setPage={navTo} reloadCampaigns={reloadCampaigns} activeCampaign={activeCampaign} />}
              {page === "campaigns" && <Campaigns campaigns={campaigns} setPage={navTo} setActiveCampaignId={setActiveCampaignId} reload={reloadCampaigns} />}
              {page === "simulate"  && <Simulate campaign={activeCampaign} targets={targets} setPage={navTo} />}
              {page === "report"    && <Report campaign={activeCampaign} stats={stats} targets={targets} />}
            </>
          )}
        </main>

        <nav className="bottom-nav">
          {NAV.map(n => (
            <div key={n.id} className={`bn-item${page === n.id ? " active" : ""}`} onClick={() => setPage(n.id)}>
              <span className="bn-icon">{n.icon}</span>
              <span>{n.label}</span>
            </div>
          ))}
        </nav>
      </div>
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ campaigns, activeCampaignId, setActiveCampaignId, targets, events, stats, connected, setPage, reloadCampaigns, activeCampaign }) {
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  if (!campaigns.length) return (
    <div className="splash">
      <div style={{ fontSize:"3rem" }}>🎣</div>
      <h2>No Campaigns Yet</h2>
      <p>Create your first phishing simulation to start testing security awareness.</p>
      <button className="btn" onClick={() => setPage("campaigns")}>+ CREATE CAMPAIGN</button>
    </div>
  );

  const depts = [...new Set(targets.map(t => t.department))].map(d => ({
    name: d,
    total:   targets.filter(t => t.department === d).length,
    clicked: targets.filter(t => t.department === d && t.clicked).length,
  })).sort((a, b) => (b.clicked / b.total) - (a.clicked / a.total));

  const clicked    = stats?.clicked ?? 0;
  const submitted  = stats?.submitted ?? 0;
  const clickRate  = stats?.clickRate ?? "0";
  const submitRate = stats?.submitRate ?? "0";

  const sendEmails = async () => {
    if (!activeCampaignId) return;
    setSending(true); setSendResult(null);
    try { const r = await api.sendEmails(activeCampaignId); setSendResult(r); }
    catch (e) { setSendResult({ error: e.message }); }
    setSending(false);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">MISSION CONTROL</div>
        <div className="page-sub">{connected ? "● SSE LIVE — dashboard updates the instant a target clicks" : "○ Connecting to SSE stream..."}</div>
      </div>

      <div style={{ display:"flex", gap:".5rem", flexWrap:"wrap", marginBottom:"1rem", alignItems:"center" }}>
        <select style={{ background:"var(--s2)", border:"1px solid var(--border2)", color:"var(--text)", fontFamily:"var(--mono)", fontSize:".72rem", padding:".4rem .7rem", borderRadius:"3px", outline:"none" }}
          value={activeCampaignId || ""} onChange={e => setActiveCampaignId(e.target.value)}>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" style={{ background:"var(--s2)", color:"var(--text2)", border:"1px solid var(--border2)" }} onClick={sendEmails} disabled={sending}>
          {sending ? <><span className="spin">⚙</span> SENDING...</> : "📧 SEND EMAILS"}
        </button>
        <button className="btn sec" onClick={() => setPage("simulate")}>▶ SIMULATE</button>
        <button className="btn" onClick={() => setPage("report")}>📋 REPORT</button>
      </div>

      {sendResult && (
        <div className={`alert ${sendResult.error ? "r" : "g"}`}>
          {sendResult.error
            ? `❌ ${sendResult.error}`
            : `✅ ${sendResult.sent} emails sent${sendResult.results?.find(r => r.preview) ? ` · Preview: ${sendResult.results.find(r => r.preview).preview}` : ""}`}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card r"><div className="stat-lbl">Click Rate</div><div className="stat-val">{clickRate}%</div><div className="stat-note">{clicked} of {targets.length} targets</div><div className="stat-bar"><div className="stat-fill" style={{ width:`${clickRate}%` }} /></div></div>
        <div className="stat-card a"><div className="stat-lbl">Cred Submit</div><div className="stat-val">{submitRate}%</div><div className="stat-note">{submitted} credentials stolen</div><div className="stat-bar"><div className="stat-fill" style={{ width:`${submitRate}%` }} /></div></div>
        <div className="stat-card g"><div className="stat-lbl">Resisted</div><div className="stat-val">{targets.filter(t => !t.clicked).length}</div><div className="stat-note">Did not click</div></div>
        <div className="stat-card c"><div className="stat-lbl">Targets</div><div className="stat-val">{targets.length}</div><div className="stat-note">{activeCampaign?.template_lure || "—"} lure</div></div>
      </div>

      <div className="cg2">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">TARGET STATUS</div>
            <span className={`pill ${connected ? "g" : "m"}`}>{connected ? "● SSE LIVE" : "○ OFFLINE"}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Dept</th><th>Sent</th><th>Clicked</th><th>Creds</th><th>Time</th></tr></thead>
              <tbody>
                {targets.map(t => (
                  <tr key={t.id} className={t.clicked ? "row-flash" : ""}>
                    <td><strong>{t.name}</strong></td>
                    <td><span className="pill m">{t.department}</span></td>
                    <td>{t.email_sent ? <span className="pill c">SENT</span> : <span className="pill m">PENDING</span>}</td>
                    <td>{t.clicked ? <span className="pill r">CLICKED</span> : <span className="pill g">SAFE</span>}</td>
                    <td>{t.submitted ? <span className="pill r">STOLEN</span> : <span className="pill m">—</span>}</td>
                    <td style={{ fontFamily:"var(--mono)", fontSize:".6rem", color:"var(--text3)" }}>{t.clicked_at ? new Date(t.clicked_at).toLocaleTimeString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col">
          <div className="panel">
            <div className="panel-header"><div className="panel-title">DEPT <span className="accent">EXPOSURE</span></div></div>
            <div className="panel-body">
              {depts.map(d => {
                const pct = d.total ? ((d.clicked / d.total) * 100).toFixed(0) : 0;
                return (
                  <div key={d.name} className="dept-row">
                    <div className="dept-meta">
                      <span style={{ color:"var(--text2)", fontSize:".72rem" }}>{d.name}</span>
                      <span style={{ fontFamily:"var(--mono)", fontSize:".62rem", color: d.clicked > 0 ? "var(--red)" : "var(--green)" }}>{d.clicked}/{d.total}</span>
                    </div>
                    <div className="dept-pbar"><div className="dept-fill" style={{ width:`${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel" style={{ flex:1 }}>
            <div className="panel-header">
              <div className="panel-title">EVENT FEED <span className="accent">{connected ? "● LIVE PUSH" : "○ OFFLINE"}</span></div>
            </div>
            <div className="panel-body" style={{ padding:".75rem 1rem" }}>
              <div className="logfeed">
                {events.length === 0
                  ? <div style={{ color:"var(--text3)" }}>Awaiting events...</div>
                  : events.map((e, i) => (
                    <div key={e.id ?? i} className="log-entry">
                      <span className="log-time">[{new Date(e.timestamp).toLocaleTimeString()}]</span>
                      <span className={`log-msg ${e.event_type}`}>
                        {e.event_type === "click"  && `🎣 ${e.target_name} CLICKED`}
                        {e.event_type === "submit" && `🔑 ${e.target_name} SUBMITTED CREDS`}
                        {e.event_type === "sent"   && `📧 Email → ${e.target_name}`}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
function Campaigns({ campaigns, setPage, setActiveCampaignId, reload }) {
  const [name, setName] = useState("Operation RedHook");
  const [tpl, setTpl] = useState(TEMPLATES[0]);
  const [senderName, setSenderName] = useState("IT Security");
  const [senderEmail, setSenderEmail] = useState("security@company.com");
  const [count, setCount] = useState(8);
  const [customCSV, setCustomCSV] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [preview, setPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setCreating(true); setError("");
    let targets = SAMPLE_TARGETS.slice(0, count);
    if (useCustom && customCSV.trim()) {
      try {
        targets = customCSV.trim().split("\n").map(line => {
          const [name, email, dept] = line.split(",").map(s => s.trim());
          if (!name || !email) throw new Error(`Bad line: "${line}"`);
          return { name, email, dept: dept || "Unknown" };
        });
      } catch (e) { setError(e.message); setCreating(false); return; }
    }
    try {
      const c = await api.createCampaign({ name, senderName, senderEmail, template: tpl, targets });
      setActiveCampaignId(c.id);
      await reload();
      setPage("dashboard");
    } catch (e) { setError(e.message); }
    setCreating(false);
  };

  const del = async (id) => {
    if (!confirm("Delete this campaign?")) return;
    await api.deleteCampaign(id); await reload();
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">CAMPAIGN BUILDER</div>
        <div className="page-sub">Configure · Deploy · Track</div>
      </div>
      <div className="alert w">⚠ Authorized security awareness training only. Written permission required.</div>
      {error && <div className="alert r">❌ {error}</div>}

      <div className="cg2e">
        <div className="col">
          <div className="panel">
            <div className="panel-header"><div className="panel-title">CAMPAIGN DETAILS</div></div>
            <div className="panel-body">
              <div className="fr"><label>Campaign Name</label><input value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="fr"><label>Sender Name</label><input value={senderName} onChange={e => setSenderName(e.target.value)} /></div>
              <div className="fr"><label>Sender Email</label><input value={senderEmail} onChange={e => setSenderEmail(e.target.value)} /></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><div className="panel-title">TARGETS</div></div>
            <div className="panel-body">
              <div style={{ display:"flex", gap:".5rem", marginBottom:"1rem" }}>
                <button className={`btn${!useCustom ? "" : " sec"}`} style={{ flex:1, justifyContent:"center" }} onClick={() => setUseCustom(false)}>SAMPLE</button>
                <button className={`btn${useCustom ? "" : " sec"}`} style={{ flex:1, justifyContent:"center" }} onClick={() => setUseCustom(true)}>CUSTOM CSV</button>
              </div>
              {!useCustom ? (
                <div className="fr">
                  <label>Count — <span style={{ color:"var(--cyan)" }}>{count} targets</span></label>
                  <input type="range" min="3" max="10" value={count} onChange={e => setCount(+e.target.value)} style={{ padding:0, border:"none", background:"none", accentColor:"var(--red)", width:"100%" }} />
                </div>
              ) : (
                <div className="fr">
                  <label>name, email, department — one per line</label>
                  <textarea value={customCSV} onChange={e => setCustomCSV(e.target.value)}
                    placeholder={"Alice, alice@corp.com, Engineering\nBob, bob@corp.com, Finance"}
                    style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border2)", color:"var(--text)", fontFamily:"var(--mono)", fontSize:".72rem", padding:".5rem .7rem", borderRadius:"3px", outline:"none", resize:"vertical", minHeight:"100px", lineHeight:"1.6" }} />
                </div>
              )}
            </div>
          </div>

          {preview && (
            <div className="panel">
              <div className="panel-header"><div className="panel-title">EMAIL PREVIEW</div></div>
              <div className="email-chrome">
                <div className="email-from">From: {senderName} &lt;{senderEmail}&gt;</div>
                <div className="email-subj">{tpl.subject.replace("{sender}", senderName)}</div>
              </div>
              <div className="email-body">
                {tpl.body.replace("{name}", "Alice").replace("{sender}", senderName).split("[").map((part, i) => {
                  if (i === 0) return <span key={i}>{part}</span>;
                  const [lbl, rest] = part.split("]");
                  return <span key={i}><span className="phlink">🔗 {lbl}</span>{rest}</span>;
                })}
              </div>
            </div>
          )}
        </div>

        <div className="panel" style={{ height:"fit-content" }}>
          <div className="panel-header">
            <div className="panel-title">PHISHING TEMPLATE</div>
            <button className="btn sec" style={{ padding:".25rem .6rem", fontSize:".6rem" }} onClick={() => setPreview(p => !p)}>
              {preview ? "HIDE" : "PREVIEW"}
            </button>
          </div>
          <div className="panel-body">
            {TEMPLATES.map(t => (
              <div key={t.id} className={`tcard${tpl.id === t.id ? " sel" : ""}`} onClick={() => setTpl(t)}>
                <div className="tcard-name">{t.name}</div>
                <div className="tcard-subj">{t.subject.replace("{sender}", senderName)}</div>
                <div className="tcard-lure">LURE: {t.lure}</div>
              </div>
            ))}
            <div className="btn-row">
              <button className="btn" onClick={create} disabled={creating || !name.trim()}>
                {creating ? <><span className="spin">⚙</span> CREATING...</> : "🚀 LAUNCH CAMPAIGN"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {campaigns.length > 0 && (
        <>
          <hr className="divider" />
          <div style={{ fontFamily:"var(--disp)", fontWeight:700, letterSpacing:".06em", marginBottom:".75rem" }}>ALL CAMPAIGNS</div>
          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Template</th><th>Targets</th><th>Click %</th><th>Submit %</th><th>Created</th><th></th></tr></thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td><span className="pill c">{c.template_name}</span></td>
                      <td style={{ fontFamily:"var(--mono)" }}>{c.stats?.total ?? "—"}</td>
                      <td style={{ color:+c.stats?.clickRate > 0 ? "var(--red)" : "var(--green)", fontFamily:"var(--mono)" }}>{c.stats?.clickRate ?? 0}%</td>
                      <td style={{ color:+c.stats?.submitRate > 0 ? "var(--amber)" : "var(--green)", fontFamily:"var(--mono)" }}>{c.stats?.submitRate ?? 0}%</td>
                      <td style={{ fontFamily:"var(--mono)", fontSize:".6rem", color:"var(--text3)" }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      <td style={{ display:"flex", gap:".4rem" }}>
                        <button className="btn sec" style={{ padding:".25rem .55rem", fontSize:".6rem" }} onClick={() => { setActiveCampaignId(c.id); setPage("dashboard"); }}>VIEW</button>
                        <button className="btn" style={{ padding:".25rem .55rem", fontSize:".6rem", background:"transparent", color:"var(--red)", border:"1px solid var(--red)" }} onClick={() => del(c.id)}>DEL</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Simulate ─────────────────────────────────────────────────────────────────
function Simulate({ campaign, targets, setPage }) {
  const [phase, setPhase] = useState("list");
  const [sel, setSel] = useState(null);
  const [creds, setCreds] = useState({ u:"", p:"" });
  const [busy, setBusy] = useState(false);

  if (!campaign) return (
    <div className="splash">
      <div style={{ fontSize:"3rem" }}>📭</div>
      <h2>No Campaign Selected</h2>
      <button className="btn" onClick={() => setPage("campaigns")}>+ CREATE CAMPAIGN</button>
    </div>
  );

  const target = targets.find(t => t.id === sel);

  const doClick = async () => {
    setBusy(true);
    await api.simulateClick(campaign.id, sel);
    setBusy(false);
    setPhase("landing");
  };

  const doSubmit = async () => {
    if (!creds.u || !creds.p) return;
    setBusy(true);
    await api.simulateSubmit(campaign.id, sel);
    setBusy(false);
    setPhase("caught");
    setCreds({ u:"", p:"" });
  };

  const back = (to) => { setPhase(to); if (to === "list") setSel(null); };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">SIMULATION SANDBOX</div>
        <div className="page-sub">Clicks & submissions push via SSE → Dashboard updates instantly</div>
      </div>

      {phase === "list" && (
        <>
          <div className="alert i">ℹ Select a target. Interactions fire SSE events — watch your Dashboard update in real time without any refresh.</div>
          <div className="cg2e">
            <div className="panel" style={{ overflow:"hidden" }}>
              <div className="panel-header"><div className="panel-title">SELECT TARGET</div></div>
              {targets.map(t => (
                <div key={t.id} className={`inbox-row${sel === t.id ? " active" : ""}`} onClick={() => { setSel(t.id); setPhase("inbox"); }}>
                  <div className="avatar">{t.name[0]}</div>
                  <div className="inbox-info">
                    <div className="inbox-name">{t.name}</div>
                    <div className="inbox-preview">{t.department} · {t.email}</div>
                  </div>
                  <div>
                    {t.submitted && <span className="pill r">CAUGHT</span>}
                    {t.clicked && !t.submitted && <span className="pill a">CLICKED</span>}
                    {!t.clicked && <span className="pill g">SAFE</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="panel" style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:".5rem", padding:"2rem", color:"var(--text3)" }}>
              <div style={{ fontSize:"2rem" }}>👈</div>
              <div style={{ fontFamily:"var(--mono)", fontSize:".7rem" }}>Select a target to begin</div>
            </div>
          </div>
        </>
      )}

      {phase === "inbox" && target && (
        <>
          <button className="btn sec" style={{ marginBottom:"1rem" }} onClick={() => back("list")}>← ALL TARGETS</button>
          <div style={{ marginBottom:"1rem" }}>
            <div style={{ fontWeight:600 }}>{target.name}'s Inbox</div>
            <div style={{ fontFamily:"var(--mono)", fontSize:".68rem", color:"var(--text3)" }}>{target.email}</div>
          </div>
          <div className="panel" style={{ cursor:"pointer" }} onClick={() => setPhase("email")}>
            <div className="inbox-row active">
              <div className="avatar" style={{ background:"var(--red-dim)", color:"var(--red)", border:"1px solid rgba(255,45,85,.3)" }}>📧</div>
              <div className="inbox-info">
                <div className="inbox-name">IT Security</div>
                <div className="inbox-preview">{campaign.template_subject} — Click to open</div>
              </div>
              <span className="pill r">UNREAD</span>
            </div>
          </div>
          <div style={{ fontFamily:"var(--mono)", fontSize:".68rem", color:"var(--text3)", marginTop:".5rem" }}>↑ Click the email to open it</div>
        </>
      )}

      {phase === "email" && target && (
        <>
          <button className="btn sec" style={{ marginBottom:"1rem" }} onClick={() => back("inbox")}>← INBOX</button>
          <div className="panel">
            <div className="email-chrome">
              <div className="email-from">From: {campaign.sender_name} &lt;{campaign.sender_email}&gt; → {target.email}</div>
              <div className="email-subj">{campaign.template_subject}</div>
            </div>
            <div className="email-body">
              {campaign.template_body.replace("{name}", target.name).replace("{sender}", campaign.sender_name).split("[").map((part, i) => {
                if (i === 0) return <span key={i}>{part}</span>;
                const [lbl, rest] = part.split("]");
                return <span key={i}><span className="phlink" onClick={busy ? undefined : doClick}>{busy ? <span className="spin">⚙</span> : "🔗"} {lbl}</span>{rest}</span>;
              })}
            </div>
          </div>
          <div className="alert r" style={{ marginTop:".75rem" }}>🎯 Click fires an SSE event → Dashboard reflects the change instantly, zero polling</div>
        </>
      )}

      {phase === "landing" && target && (
        <>
          <div className="alert r" style={{ marginBottom:"1rem" }}>🎯 {target.name} clicked — Dashboard updated via SSE push</div>
          <div className="harvest-bg">
            <div className="harvest-card">
              <div className="harvest-logo">🔐 <span>SECURE</span>PORTAL</div>
              <p style={{ fontFamily:"var(--mono)", fontSize:".62rem", color:"var(--text3)", textAlign:"center" }}>Session expired. Verify identity to continue.</p>
              <div className="hf">
                <label>Email</label>
                <input placeholder={target.email} value={creds.u} onChange={e => setCreds(c => ({ ...c, u:e.target.value }))} />
                <label>Password</label>
                <input type="password" placeholder="••••••••" value={creds.p} onChange={e => setCreds(c => ({ ...c, p:e.target.value }))} />
                <button onClick={doSubmit} disabled={!creds.u || !creds.p || busy}>{busy ? "SUBMITTING..." : "SIGN IN →"}</button>
              </div>
            </div>
          </div>
          <button className="btn sec" style={{ marginTop:"1rem" }} onClick={() => back("list")}>← BACK TO TARGETS</button>
        </>
      )}

      {phase === "caught" && (
        <div className="panel">
          <div className="caught-screen">
            <div style={{ fontSize:"3rem" }}>🛑</div>
            <div className="caught-title">YOU'VE BEEN PHISHED</div>
            <div className="caught-body">
              This was a <strong>simulated phishing attack</strong> by your security team.{"\n\n"}
              Credentials captured. Dashboard updated in real-time via SSE push.{"\n\n"}
              <strong>Remember:</strong>{"\n"}
              • Verify the sender before clicking any link{"\n"}
              • Check the URL before entering credentials{"\n"}
              • Report suspicious emails to security@company.com
            </div>
            <button className="btn" onClick={() => back("list")}>← BACK TO SIMULATION</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────
// Calls your local Express backend at /api/generate-report
// which proxies to Gemini using GEMINI_API_KEY from server/.env
function Report({ campaign, stats, targets }) {
  const [report, setReport]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  if (!campaign) return (
    <div className="splash">
      <div style={{ fontSize:"3rem" }}>📋</div>
      <h2>No Campaign Selected</h2>
    </div>
  );

  const generate = async () => {
    setLoading(true); setReport(""); setError("");

    const deptData = [...new Set(targets.map(t => t.department))].map(d => {
      const dt = targets.filter(t => t.department === d);
      return `${d}: ${dt.filter(t => t.clicked).length}/${dt.length} clicked, ${dt.filter(t => t.submitted).length} submitted credentials`;
    }).join("\n");

    const prompt = `Generate a professional Security Awareness Training Report:

Campaign: ${campaign.name}
Date: ${campaign.created_at}
Template: ${campaign.template_name} (${campaign.template_lure} lure)
Targets: ${targets.length} | Click Rate: ${stats?.clickRate}% (${stats?.clicked} clicked) | Submit Rate: ${stats?.submitRate}% (${stats?.submitted} submitted)

Department Breakdown:
${deptData}

Write sections: Executive Summary, Risk Rating (Low/Medium/High/Critical), Key Findings, Department Analysis, 5 Recommendations. Professional and concise.`;

    try {
      // Calls your local Express backend — no CORS issues, key stays in .env
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt, 
          stats, 
          campaignName: campaign.name 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setReport(data.text);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">SECURITY REPORT</div>
        <div className="page-sub">Gemini AI-generated executive analysis · {campaign.name}</div>
      </div>

      <div className="stats-grid">
        <div className="stat-card r"><div className="stat-lbl">Click Rate</div><div className="stat-val">{stats?.clickRate ?? 0}%</div></div>
        <div className="stat-card a"><div className="stat-lbl">Submit Rate</div><div className="stat-val">{stats?.submitRate ?? 0}%</div></div>
        <div className="stat-card g"><div className="stat-lbl">Resisted</div><div className="stat-val">{targets.filter(t => !t.clicked).length}</div></div>
        <div className="stat-card c"><div className="stat-lbl">Targets</div><div className="stat-val">{targets.length}</div></div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">✦ GEMINI AI ANALYSIS</div>
          <div className="btn-row" style={{ marginTop:0 }}>
            {report && (
              <button className="btn sec" style={{ padding:".3rem .7rem", fontSize:".6rem" }} onClick={() => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([report], { type:"text/plain" }));
                a.download = `${campaign.name}_report.txt`; a.click();
              }}>⬇ EXPORT</button>
            )}
            <button className="btn gem" onClick={generate} disabled={loading}>
              {loading ? <><span className="spin">⚙</span> GENERATING...</> : "✦ GENERATE REPORT"}
            </button>
          </div>
        </div>
        <div className="panel-body">
          {error && (
            <div className="alert r" style={{ marginBottom:".75rem" }}>
              ✕ {error} — make sure <code>GEMINI_API_KEY</code> is set in <code>server/.env</code>
            </div>
          )}
          {!report && !loading && !error && (
            <div style={{ textAlign:"center", padding:"3rem 1rem", color:"var(--text3)", fontFamily:"var(--mono)", fontSize:".7rem" }}>
              Click "Generate Report" for a Gemini-powered security awareness analysis.
            </div>
          )}
          {loading && (
            <div style={{ textAlign:"center", padding:"3rem 1rem", color:"var(--cyan)", fontFamily:"var(--mono)", fontSize:".72rem" }}>
              <span className="spin">⚙</span> Gemini is analyzing campaign data...
            </div>
          )}
          {report && (
            <div className="report-body">
              {report.split("\n").map((line, i) => {
                if (/^#{1,2}\s/.test(line)) return <h2 key={i}>{line.replace(/^#+\s/, "")}</h2>;
                if (/^###/.test(line))       return <h3 key={i}>{line.replace(/^###\s*/, "")}</h3>;
                if (/\*\*(.+?)\*\*/.test(line)) return <p key={i} dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />;
                return <p key={i}>{line || "\u00a0"}</p>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
